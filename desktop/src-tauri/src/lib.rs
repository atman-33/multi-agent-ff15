use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

// ---------------------------------------------------------------------------
// Project root resolution
// ---------------------------------------------------------------------------

fn get_project_root() -> Result<PathBuf, String> {
    // 1. Environment variable override
    if let Ok(root) = std::env::var("MULTI_AGENT_FF15_ROOT") {
        let path = PathBuf::from(root);
        if path.join("scripts").exists() {
            return Ok(path);
        }
    }

    // 2. Compile-time: src-tauri/ -> desktop/ -> project root
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    if let Some(root) = manifest_dir.parent().and_then(|p| p.parent()) {
        let root = root.to_path_buf();
        if root.join("scripts").exists() {
            return Ok(root);
        }
    }

    // 3. CWD fallback
    if let Ok(cwd) = std::env::current_dir() {
        for ancestor in cwd.ancestors() {
            if ancestor.join("scripts").exists() && ancestor.join("queue").exists() {
                return Ok(ancestor.to_path_buf());
            }
        }
    }

    Err("Could not determine project root. Set MULTI_AGENT_FF15_ROOT env var.".into())
}

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Debug, Clone)]
struct InboxMessage {
    id: String,
    from: String,
    #[serde(rename = "type")]
    msg_type: String,
    timestamp: String,
    content: String,
    read: bool,
}

#[derive(Serialize, Deserialize, Debug)]
struct InboxFile {
    messages: Vec<InboxMessage>,
}

#[derive(Serialize, Debug)]
struct HealthResult {
    wsl_detected: bool,
    wsl_distro: String,
    tmux_available: bool,
    tmux_version: String,
    python3_available: bool,
    python3_version: String,
    scripts_executable: Vec<ScriptStatus>,
    inbox_readable: bool,
    inbox_writable: bool,
}

#[derive(Serialize, Debug)]
struct ScriptStatus {
    name: String,
    executable: bool,
}

#[derive(Serialize, Debug)]
struct TmuxPane {
    name: String,
    content: String,
}

// ---------------------------------------------------------------------------
// Allowed agents for validation
// ---------------------------------------------------------------------------

const ALLOWED_TARGETS: &[&str] = &["noctis", "lunafreya"];
const ALLOWED_INBOX_AGENTS: &[&str] = &[
    "noctis",
    "lunafreya",
    "ignis",
    "gladiolus",
    "prompto",
    "iris",
    "crystal",
];
const MODEL_SWITCH_TARGETS: &[&str] = &["noctis", "lunafreya", "ignis", "gladiolus", "prompto"];
const ALLOWED_SENDERS: &[&str] = &[
    "crystal",
    "user",
    "noctis",
    "lunafreya",
    "ignis",
    "gladiolus",
    "prompto",
    "iris",
];

const CHAT_LOG_PATH: &str = "runtime/logs/agent-chat-monitor.jsonl";
const INBOX_LOG_PATH: &str = "runtime/logs/inbox-log.jsonl";
const SESSION_THREAD_INDEX_PATH: &str = "runtime/state/session-thread-index.json";
const LEGACY_SESSION_THREAD_INDEX_PATH: &str = "runtime/state/session-thread-bindings.json";
const RUNTIME_TARGET_STATE_PATH: &str = "runtime/state/runtime-target-state.json";

#[derive(Serialize, Deserialize, Debug, Clone)]
struct ModelOption {
    label: String,
}

#[derive(Deserialize, Debug)]
struct ModelsYaml {
    model_definitions: std::collections::HashMap<String, String>,
}

// ---------------------------------------------------------------------------
// Chat log types
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Debug, Clone)]
struct ChatLogMeta {
    pane: String,
    event: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct ChatLogRecord {
    id: String,
    ts: String,
    agent: String,
    source: String,
    kind: String,
    #[serde(default)]
    content: Option<String>,
    session_id: String,
    meta: ChatLogMeta,
    #[serde(default)]
    schema_version: Option<u32>,
    #[serde(default)]
    item_id: Option<String>,
    #[serde(default)]
    message_id: Option<String>,
    #[serde(default)]
    turn_id: Option<String>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    state: Option<String>,
    #[serde(default)]
    data: Option<serde_json::Value>,
}

#[derive(Serialize, Debug)]
struct ChatLogPage {
    records: Vec<ChatLogRecord>,
    /// Next cursor (line number after the last returned record).
    next_cursor: usize,
    /// Total lines in the file (including broken/skipped lines).
    total_lines: usize,
    /// Whether the file was truncated/reset since the last read.
    reset: bool,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
struct ChatSessionSummary {
    agent: String,
    is_active: bool,
    last_activity_at: String,
    message_count: usize,
    preview: String,
    session_id: String,
    started_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
enum ThreadBindingState {
    Active,
    Saved,
    Missing,
    Restored,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
struct SessionThreadBinding {
    latest_session_id: Option<String>,
    rebound_from_session_id: Option<String>,
    status: ThreadBindingState,
    updated_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
struct SessionThreadRecord {
    agent: String,
    binding: SessionThreadBinding,
    last_activity_at: String,
    message_count: usize,
    preview: String,
    session_ids: Vec<String>,
    started_at: String,
    thread_id: String,
    title: String,
    updated_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct AgentSessionThreadState {
    selected_thread_id: Option<String>,
    threads: Vec<SessionThreadRecord>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum RuntimeTargetTransportMode {
    DirectSession,
    InboxFallback,
    Unsupported,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum RuntimeTargetSwitchStatus {
    Unset,
    Idle,
    Ready,
    ResumeRequired,
    InboxFallback,
    Unsupported,
    Failed,
    Switching,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct AgentRuntimeTargetState {
    checked_at: Option<String>,
    confirmed_at: Option<String>,
    selected_thread_id: Option<String>,
    selected_session_id: Option<String>,
    transport_mode: RuntimeTargetTransportMode,
    switch_status: RuntimeTargetSwitchStatus,
    last_error: Option<String>,
    updated_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
struct RuntimeTargetStateFile {
    schema_version: u32,
    updated_at: String,
    agents: std::collections::HashMap<String, AgentRuntimeTargetState>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct RuntimeTargetSnapshot {
    agent: String,
    checked_at: Option<String>,
    confirmed_at: Option<String>,
    selected_thread_id: Option<String>,
    selected_session_id: Option<String>,
    transport_mode: RuntimeTargetTransportMode,
    switch_status: RuntimeTargetSwitchStatus,
    direct_session_supported: bool,
    inbox_fallback_available: bool,
    last_error: Option<String>,
    updated_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
struct AgentSessionBindingState {
    agent: String,
    selected_thread_id: Option<String>,
    threads: Vec<SessionThreadRecord>,
    #[serde(default)]
    runtime_target: Option<RuntimeTargetSnapshot>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
struct SessionThreadIndex {
    schema_version: u32,
    updated_at: String,
    agents: std::collections::HashMap<String, AgentSessionThreadState>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
struct SessionBindingResolution {
    agent: String,
    thread_id: String,
    state: ThreadBindingState,
    latest_session_id: Option<String>,
    previous_session_id: Option<String>,
    runtime_status: Option<String>,
    checked_at: String,
    thread: SessionThreadRecord,
    runtime_target: RuntimeTargetSnapshot,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
struct SessionIdResolution {
    agent: String,
    session_id: String,
    state: ThreadBindingState,
    runtime_status: Option<String>,
    checked_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
struct RuntimeOpencodeManifest {
    agents: std::collections::HashMap<String, RuntimeOpencodeEndpoint>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
struct RuntimeOpencodeEndpoint {
    base_url: String,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct SessionStatusRecord {
    #[serde(rename = "type")]
    status_type: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
struct LegacySessionThreadIndex {
    version: u32,
    agents: std::collections::HashMap<String, LegacyAgentSessionBindingState>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct LegacyAgentSessionBindingState {
    agent: String,
    selected_thread_id: Option<String>,
    threads: Vec<LegacySessionThreadRecord>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
struct LegacySessionThreadRecord {
    agent: String,
    thread_id: String,
    created_at: String,
    updated_at: String,
    preview: String,
    started_at: String,
    last_activity_at: String,
    session_ids: Vec<String>,
    latest_session_id: Option<String>,
    binding_state: ThreadBindingState,
    last_checked_at: Option<String>,
    last_restored_at: Option<String>,
    previous_session_id: Option<String>,
}

// ---------------------------------------------------------------------------
// Inbox log types (unified: Crystal→Agent + Agent→Agent)
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Debug, Clone)]
struct InboxLogRecord {
    id: String,
    ts: String,
    from: String,
    to: String,
    #[serde(rename = "type")]
    msg_type: String,
    content: String,
}

#[derive(Serialize, Debug)]
struct InboxLogPage {
    records: Vec<InboxLogRecord>,
    next_cursor: usize,
    total_lines: usize,
    reset: bool,
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Read docs/shared/board.md and return its content.
#[tauri::command]
fn read_board() -> Result<String, String> {
    let root = get_project_root()?;
    let path = root.join("docs/shared/board.md");
    std::fs::read_to_string(&path).map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => "board.md not found".to_string(),
        _ => format!("Failed to read board.md: {}", e),
    })
}

/// Run `inbox_read.sh <agent> --peek` and return the unread count.
#[tauri::command]
fn peek_inbox(agent: String) -> Result<u32, String> {
    if !ALLOWED_INBOX_AGENTS.contains(&agent.as_str()) {
        return Err(format!("Invalid agent: {}", agent));
    }

    let root = get_project_root()?;
    let script = root.join("scripts/inbox_read.sh");

    let output = Command::new("bash")
        .arg(&script)
        .arg(&agent)
        .arg("--peek")
        .current_dir(&root)
        .output()
        .map_err(|e| format!("Failed to execute inbox_read.sh: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    // Parse "N unread messages" pattern
    let count = stdout
        .split_whitespace()
        .next()
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(0);

    Ok(count)
}

/// Parse queue/inbox/<agent>.yaml directly (read-only, no state mutation).
#[tauri::command]
fn list_inbox_messages(agent: String) -> Result<Vec<InboxMessage>, String> {
    if !ALLOWED_INBOX_AGENTS.contains(&agent.as_str()) {
        return Err(format!("Invalid agent: {}", agent));
    }

    let root = get_project_root()?;
    let path = root.join(format!("queue/inbox/{}.yaml", agent));

    if !path.exists() {
        return Ok(vec![]);
    }

    let content =
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read inbox: {}", e))?;

    let inbox: InboxFile =
        serde_yaml::from_str(&content).map_err(|e| format!("Failed to parse inbox YAML: {}", e))?;

    Ok(inbox.messages)
}

/// Mark a single inbox message as read by ID.
#[tauri::command]
fn mark_inbox_read(agent: String, message_id: String) -> Result<(), String> {
    if !ALLOWED_INBOX_AGENTS.contains(&agent.as_str()) {
        return Err(format!("Invalid agent: {}", agent));
    }

    let root = get_project_root()?;
    let path = root.join(format!("queue/inbox/{}.yaml", agent));
    if !path.exists() {
        return Err("Inbox file not found".into());
    }

    let content =
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read inbox: {}", e))?;
    let mut inbox: InboxFile =
        serde_yaml::from_str(&content).map_err(|e| format!("Failed to parse inbox YAML: {}", e))?;

    let mut found = false;
    for msg in &mut inbox.messages {
        if msg.id == message_id {
            msg.read = true;
            found = true;
            break;
        }
    }

    if !found {
        return Err(format!("Message not found: {}", message_id));
    }

    let yaml_str =
        serde_yaml::to_string(&inbox).map_err(|e| format!("Failed to serialize YAML: {}", e))?;
    let tmp_path = path.with_extension("yaml.tmp");
    std::fs::write(&tmp_path, &yaml_str)
        .map_err(|e| format!("Failed to write temp file: {}", e))?;
    std::fs::rename(&tmp_path, &path).map_err(|e| format!("Failed to rename temp file: {}", e))?;

    Ok(())
}

/// Mark all inbox messages as read.
#[tauri::command]
fn mark_all_inbox_read(agent: String) -> Result<(), String> {
    if !ALLOWED_INBOX_AGENTS.contains(&agent.as_str()) {
        return Err(format!("Invalid agent: {}", agent));
    }

    let root = get_project_root()?;
    let path = root.join(format!("queue/inbox/{}.yaml", agent));
    if !path.exists() {
        return Err("Inbox file not found".into());
    }

    let content =
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read inbox: {}", e))?;
    let mut inbox: InboxFile =
        serde_yaml::from_str(&content).map_err(|e| format!("Failed to parse inbox YAML: {}", e))?;

    for msg in &mut inbox.messages {
        msg.read = true;
    }

    let yaml_str =
        serde_yaml::to_string(&inbox).map_err(|e| format!("Failed to serialize YAML: {}", e))?;
    let tmp_path = path.with_extension("yaml.tmp");
    std::fs::write(&tmp_path, &yaml_str)
        .map_err(|e| format!("Failed to write temp file: {}", e))?;
    std::fs::rename(&tmp_path, &path).map_err(|e| format!("Failed to rename temp file: {}", e))?;

    Ok(())
}

/// Send a message via inbox_write.sh. Arguments passed as array (no shell expansion).
#[tauri::command]
fn send_message(target: String, from: String, content: String) -> Result<String, String> {
    // Validate target
    if !ALLOWED_TARGETS.contains(&target.as_str()) {
        return Err(format!(
            "Invalid target: {}. Allowed: {:?}",
            target, ALLOWED_TARGETS
        ));
    }

    // Validate sender
    if !ALLOWED_SENDERS.contains(&from.as_str()) {
        return Err(format!(
            "Invalid sender: {}. Allowed: {:?}",
            from, ALLOWED_SENDERS
        ));
    }

    // Validate content
    let content = content.trim().to_string();
    if content.is_empty() {
        return Err("Message content cannot be empty".into());
    }
    if content.len() > 4096 {
        return Err("Message content exceeds maximum length (4096 chars)".into());
    }

    let root = get_project_root()?;
    let script = root.join("scripts/inbox_write.sh");

    // Execute with args array — no shell interpretation
    let output = Command::new("bash")
        .arg(&script)
        .arg(&target)
        .arg(&from)
        .arg("message")
        .arg(&content)
        .current_dir(&root)
        .output()
        .map_err(|e| format!("Failed to execute inbox_write.sh: {}", e))?;

    if output.status.success() {
        Ok("Message sent successfully".into())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("inbox_write.sh failed: {}", stderr))
    }
}

/// Read agent chat JSONL logs with optional cursor-based pagination.
/// Returns records from `cursor` record onward (0-based, after optional agent filtering),
/// up to `limit` records. If cursor is None, returns the last `limit` records.
/// Broken/unparseable lines are silently skipped (task 2.2).
#[tauri::command]
fn read_agent_chat_logs(
    limit: usize,
    cursor: Option<usize>,
    agent: Option<String>,
) -> Result<ChatLogPage, String> {
    let root = get_project_root()?;
    let log_path = root.join(CHAT_LOG_PATH);

    // If file doesn't exist yet, return empty (task 3.5).
    if !log_path.exists() {
        return Ok(ChatLogPage {
            records: vec![],
            next_cursor: 0,
            total_lines: 0,
            reset: cursor.is_some() && cursor.unwrap() > 0,
        });
    }

    let file =
        std::fs::File::open(&log_path).map_err(|e| format!("Failed to open log file: {}", e))?;
    let reader = BufReader::new(file);

    // Collect all lines, then optionally filter by agent before pagination.
    let lines: Vec<String> = reader.lines().filter_map(|l| l.ok()).collect();
    let filtered_records: Vec<ChatLogRecord> = lines
        .iter()
        .filter_map(|line| serde_json::from_str::<ChatLogRecord>(line).ok())
        .filter(|record| match agent.as_deref() {
            Some(target_agent) => record.agent == target_agent,
            None => true,
        })
        .collect();
    let total_lines = filtered_records.len();

    let is_truncated = cursor.is_some() && cursor.unwrap() > total_lines;
    let start = match cursor {
        Some(c) if !is_truncated => c,
        _ => {
            // No cursor or truncated: return last `limit` filtered records.
            if total_lines > limit {
                total_lines - limit
            } else {
                0
            }
        }
    };

    let records: Vec<ChatLogRecord> = filtered_records
        .into_iter()
        .skip(start)
        .take(limit)
        .collect();

    let consumed = records.len();
    let next_cursor = start + consumed;

    Ok(ChatLogPage {
        records,
        next_cursor,
        total_lines,
        reset: is_truncated,
    })
}

#[tauri::command]
fn read_agent_session_history(agent: String) -> Result<Vec<ChatSessionSummary>, String> {
    if !ALLOWED_INBOX_AGENTS.contains(&agent.as_str()) {
        return Err(format!("Invalid agent: {}", agent));
    }

    let root = get_project_root()?;
    let log_path = root.join(CHAT_LOG_PATH);

    if !log_path.exists() {
        return Ok(vec![]);
    }

    let file =
        std::fs::File::open(&log_path).map_err(|e| format!("Failed to open log file: {}", e))?;
    let reader = BufReader::new(file);

    let records: Vec<ChatLogRecord> = reader
        .lines()
        .filter_map(|line| line.ok())
        .filter_map(|line| serde_json::from_str::<ChatLogRecord>(&line).ok())
        .filter(|record| record.agent == agent)
        .collect();

    Ok(build_chat_session_summaries(&records, &agent))
}

#[tauri::command]
fn read_agent_session_binding_state(agent: String) -> Result<AgentSessionBindingState, String> {
    validate_session_binding_agent(&agent)?;

    let root = get_project_root()?;
    let mut index = load_session_thread_index(&root)?;
    let state = ensure_agent_session_binding_state(&mut index, &root, &agent)?;
    let mut runtime_targets = load_runtime_target_state(&root)?;
    let runtime_target = ensure_runtime_target_state(&mut runtime_targets, &agent, &state, None);
    save_session_thread_index(&root, &index)?;
    save_runtime_target_state(&root, &runtime_targets)?;
    Ok(export_agent_session_binding_state(
        &agent,
        &state,
        Some(runtime_target),
    ))
}

#[tauri::command]
fn write_agent_session_binding_state(
    state: AgentSessionBindingState,
) -> Result<AgentSessionBindingState, String> {
    validate_session_binding_agent(&state.agent)?;

    let root = get_project_root()?;
    let mut index = load_session_thread_index(&root)?;
    let previous_selected_thread_id = index
        .agents
        .get(&state.agent)
        .and_then(|existing| existing.selected_thread_id.clone());
    let imported = import_agent_session_binding_state(state)?;
    let sanitized = sanitize_agent_thread_state(&imported.agent, imported.state)?;
    let should_activate_selected_thread =
        previous_selected_thread_id != sanitized.selected_thread_id;
    index
        .agents
        .insert(imported.agent.clone(), sanitized.clone());

    if should_activate_selected_thread {
        if let Some(persisted_state) = index.agents.get_mut(&imported.agent) {
            sync_selected_thread_binding(&root, &imported.agent, persisted_state)?;
        }
    }

    save_session_thread_index(&root, &index)?;
    let mut runtime_targets = load_runtime_target_state(&root)?;
    let persisted = index
        .agents
        .get(&imported.agent)
        .cloned()
        .ok_or_else(|| format!("Failed to persist agent binding state: {}", imported.agent))?;
    let runtime_target =
        ensure_runtime_target_state(&mut runtime_targets, &imported.agent, &persisted, None);
    save_runtime_target_state(&root, &runtime_targets)?;
    Ok(export_agent_session_binding_state(
        &imported.agent,
        &persisted,
        Some(runtime_target),
    ))
}

#[tauri::command]
fn resolve_agent_session_id(
    agent: String,
    session_id: String,
) -> Result<SessionIdResolution, String> {
    validate_session_binding_agent(&agent)?;
    let session_id = session_id.trim().to_string();
    if session_id.is_empty() {
        return Err("session_id is required".into());
    }

    let root = get_project_root()?;
    let checked_at = current_iso_timestamp();
    let runtime_status = fetch_runtime_status(&root, &agent, &session_id)
        .ok()
        .flatten();
    let reachable = is_session_reachable(&root, &agent, &session_id)?;

    Ok(SessionIdResolution {
        agent,
        session_id,
        state: if reachable {
            ThreadBindingState::Active
        } else {
            ThreadBindingState::Missing
        },
        runtime_status,
        checked_at,
    })
}

#[tauri::command]
fn resolve_agent_thread_binding(
    agent: String,
    thread_id: String,
) -> Result<SessionBindingResolution, String> {
    validate_session_binding_agent(&agent)?;

    let root = get_project_root()?;
    let mut index = load_session_thread_index(&root)?;
    let _ = ensure_agent_session_binding_state(&mut index, &root, &agent)?;
    let mut runtime_targets = load_runtime_target_state(&root)?;
    let checked_at = current_iso_timestamp();

    let state = index
        .agents
        .get_mut(&agent)
        .ok_or_else(|| format!("Binding state not found for agent: {}", agent))?;
    let thread = state
        .threads
        .iter_mut()
        .find(|thread| thread.thread_id == thread_id)
        .ok_or_else(|| format!("Thread not found: {}", thread_id))?;

    let runtime_status = refresh_thread_binding(&root, &agent, thread, false)?;
    let runtime_target = if let Some(session_id) = thread.binding.latest_session_id.clone() {
        if is_direct_session_transport_supported(&agent) {
            record_runtime_target_transition(
                &root,
                &agent,
                Some(thread.thread_id.clone()),
                Some(session_id.clone()),
                RuntimeTargetTransportMode::DirectSession,
                RuntimeTargetSwitchStatus::Ready,
                None,
                "runtime_target_ready",
                "Explicit runtime target is ready for Crystal direct session transport.",
            )?;
            set_runtime_target_state(
                &mut runtime_targets,
                &agent,
                Some(thread.thread_id.clone()),
                Some(session_id),
                RuntimeTargetTransportMode::DirectSession,
                RuntimeTargetSwitchStatus::Ready,
                None,
            )
        } else {
            let error = Some(
                "Direct session transport is not available in the current Tauri runtime boundary; inbox fallback remains available."
                    .to_string(),
            );
            let activation_error = resolve_session_selection_reference(&root, &agent, &session_id)
                .ok()
                .and_then(|session_reference| {
                    activate_runtime_session(&root, &agent, &session_reference).err()
                });
            let switch_status = if activation_error.is_some() {
                RuntimeTargetSwitchStatus::Failed
            } else {
                RuntimeTargetSwitchStatus::InboxFallback
            };
            let event = if activation_error.is_some() {
                "runtime_target_switch_failed"
            } else {
                "runtime_target_inbox_fallback"
            };
            let content = if activation_error.is_some() {
                "Explicit runtime target resolved, but Tauri could not confirm pane/session switching before inbox fallback."
            } else {
                "Explicit runtime target resolved, but Tauri can only use inbox fallback for Crystal chat."
            };
            let error = activation_error
                .map(|detail| {
                    format!(
                        "{} TUI switch confirmation failed: {}",
                        error.clone().unwrap_or_default(),
                        detail
                    )
                })
                .or(error);
            record_runtime_target_transition(
                &root,
                &agent,
                Some(thread.thread_id.clone()),
                Some(session_id.clone()),
                RuntimeTargetTransportMode::InboxFallback,
                switch_status.clone(),
                error.clone(),
                event,
                content,
            )?;
            set_runtime_target_state(
                &mut runtime_targets,
                &agent,
                Some(thread.thread_id.clone()),
                Some(session_id),
                RuntimeTargetTransportMode::InboxFallback,
                switch_status,
                error,
            )
        }
    } else {
        let error =
            Some("No reachable runtime session is bound to the selected thread.".to_string());
        record_runtime_target_transition(
            &root,
            &agent,
            Some(thread.thread_id.clone()),
            None,
            RuntimeTargetTransportMode::Unsupported,
            RuntimeTargetSwitchStatus::ResumeRequired,
            error.clone(),
            "runtime_target_resume_required",
            "Selected thread requires resume before a confirmed runtime target can be used.",
        )?;
        set_runtime_target_state(
            &mut runtime_targets,
            &agent,
            Some(thread.thread_id.clone()),
            None,
            RuntimeTargetTransportMode::Unsupported,
            RuntimeTargetSwitchStatus::ResumeRequired,
            error,
        )
    };

    let resolution = SessionBindingResolution {
        agent: agent.clone(),
        thread_id: thread.thread_id.clone(),
        state: thread.binding.status.clone(),
        latest_session_id: thread.binding.latest_session_id.clone(),
        previous_session_id: thread.binding.rebound_from_session_id.clone(),
        runtime_status,
        checked_at: checked_at.clone(),
        thread: thread.clone(),
        runtime_target,
    };

    save_session_thread_index(&root, &index)?;
    save_runtime_target_state(&root, &runtime_targets)?;
    Ok(resolution)
}

#[tauri::command]
fn read_agent_runtime_target_state(agent: String) -> Result<RuntimeTargetSnapshot, String> {
    validate_session_binding_agent(&agent)?;

    let root = get_project_root()?;
    let mut index = load_session_thread_index(&root)?;
    let binding_state = ensure_agent_session_binding_state(&mut index, &root, &agent)?;
    let mut runtime_targets = load_runtime_target_state(&root)?;
    let runtime_target =
        ensure_runtime_target_state(&mut runtime_targets, &agent, &binding_state, None);

    save_session_thread_index(&root, &index)?;
    save_runtime_target_state(&root, &runtime_targets)?;

    Ok(runtime_target)
}

#[tauri::command]
fn recreate_agent_thread_binding(
    agent: String,
    thread_id: String,
) -> Result<SessionBindingResolution, String> {
    resume_agent_thread_binding(agent, thread_id)
}

#[tauri::command]
fn resume_agent_thread_binding(
    agent: String,
    thread_id: String,
) -> Result<SessionBindingResolution, String> {
    validate_session_binding_agent(&agent)?;

    let root = get_project_root()?;
    let mut index = load_session_thread_index(&root)?;
    let _ = ensure_agent_session_binding_state(&mut index, &root, &agent)?;
    let mut runtime_targets = load_runtime_target_state(&root)?;

    let existing_session_id = index
        .agents
        .get(&agent)
        .and_then(|state| {
            state
                .threads
                .iter()
                .find(|thread| thread.thread_id == thread_id)
        })
        .and_then(candidate_session_id);

    if let Some(session_id) = existing_session_id.clone() {
        if is_session_reachable(&root, &agent, &session_id)? {
            return resolve_agent_thread_binding(agent, thread_id);
        }
    }

    let new_session = create_runtime_session(&root, &agent)?;
    let now = current_iso_timestamp();

    let state = index
        .agents
        .get_mut(&agent)
        .ok_or_else(|| format!("Binding state not found for agent: {}", agent))?;
    let thread = state
        .threads
        .iter_mut()
        .find(|thread| thread.thread_id == thread_id)
        .ok_or_else(|| format!("Thread not found: {}", thread_id))?;

    if !thread
        .session_ids
        .iter()
        .any(|item| item == &new_session.session_id)
    {
        thread.session_ids.push(new_session.session_id.clone());
    }
    thread.binding.latest_session_id = Some(new_session.session_id.clone());
    thread.binding.rebound_from_session_id = existing_session_id.clone();
    thread.binding.status = ThreadBindingState::Restored;
    thread.binding.updated_at = now.clone();
    thread.last_activity_at = now.clone();
    thread.updated_at = now.clone();

    state.selected_thread_id = Some(thread.thread_id.clone());

    append_chat_status_record(
        &root,
        &agent,
        &new_session.session_id,
        "session_resumed",
        "Fresh session started for missing thread. Read recent history before continuing.",
        Some(serde_json::json!({
            "previousSessionId": existing_session_id,
            "threadId": thread.thread_id,
        })),
    )?;

    let resume_prompt = build_resume_prompt(&agent, thread, existing_session_id.as_deref());

    let resolution = SessionBindingResolution {
        agent: agent.clone(),
        thread_id: thread.thread_id.clone(),
        state: ThreadBindingState::Restored,
        latest_session_id: thread.binding.latest_session_id.clone(),
        previous_session_id: thread.binding.rebound_from_session_id.clone(),
        runtime_status: Some("idle".to_string()),
        checked_at: now,
        thread: thread.clone(),
        runtime_target: set_runtime_target_state(
            &mut runtime_targets,
            &agent,
            Some(thread.thread_id.clone()),
            thread.binding.latest_session_id.clone(),
            RuntimeTargetTransportMode::InboxFallback,
            RuntimeTargetSwitchStatus::ResumeRequired,
            Some(
                "Fresh runtime session created; direct Crystal session transport is unavailable in Tauri, and this target is not confirmed until a later send or explicit switch succeeds."
                    .to_string(),
            ),
        ),
    };

    record_runtime_target_transition(
        &root,
        &agent,
        Some(thread.thread_id.clone()),
        thread.binding.latest_session_id.clone(),
        RuntimeTargetTransportMode::InboxFallback,
        RuntimeTargetSwitchStatus::ResumeRequired,
        Some(
            "Fresh runtime session created for resume; direct-session Crystal transport remains unavailable in Tauri, and the target is not confirmed until a later send or explicit switch succeeds."
                .to_string(),
        ),
        "runtime_target_resume_created",
        "Runtime target now points at a fresh session, but Tauri has not confirmed a pre-send switch and direct Crystal session transport remains unavailable.",
    )?;

    save_session_thread_index(&root, &index)?;
    save_runtime_target_state(&root, &runtime_targets)?;
    send_tmux_prompt(&agent, &resume_prompt)?;
    Ok(resolution)
}

/// Send a message from Crystal to a target agent via inbox_write.sh.
/// target must be "noctis" or "lunafreya". Message is limited to 4000 chars.
#[tauri::command]
fn send_crystal_message(target: String, message: String) -> Result<String, String> {
    // Validate target (task 2.4)
    if !ALLOWED_TARGETS.contains(&target.as_str()) {
        return Err(format!(
            "Invalid target: {}. Allowed: {:?}",
            target, ALLOWED_TARGETS
        ));
    }

    // Validate message length (task 2.4)
    let message = message.trim().to_string();
    if message.is_empty() {
        return Err("Message content cannot be empty".into());
    }

    let root = get_project_root()?;
    let script = root.join("scripts/inbox_write.sh");

    // Execute with args array — no shell interpretation (no injection risk).
    let output = Command::new("bash")
        .arg(&script)
        .arg(&target)
        .arg("crystal")
        .arg("message")
        .arg(&message)
        .current_dir(&root)
        .output()
        .map_err(|e| format!("Failed to execute inbox_write.sh: {}", e))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        // Extract message ID: "✅ Message msg_... → agent inbox"
        let msg_id = stdout
            .split_whitespace()
            .find(|s| s.starts_with("msg_"))
            .map(|s| s.to_string())
            .unwrap_or_else(|| "sent".to_string());
        Ok(msg_id)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("inbox_write.sh failed: {}", stderr))
    }
}

/// Read unified inbox log (Crystal→Agent + Agent→Agent) with optional cursor.
/// Returns up to 200 records from `cursor` position onward.
/// If cursor is None, returns the last 200 records.
#[tauri::command]
fn read_inbox_log(cursor: Option<usize>) -> Result<InboxLogPage, String> {
    let root = get_project_root()?;
    let log_path = root.join(INBOX_LOG_PATH);

    if !log_path.exists() {
        return Ok(InboxLogPage {
            records: vec![],
            next_cursor: 0,
            total_lines: 0,
            reset: cursor.is_some() && cursor.unwrap() > 0,
        });
    }

    let file = std::fs::File::open(&log_path)
        .map_err(|e| format!("Failed to open inbox log file: {}", e))?;
    let reader = BufReader::new(file);

    let lines: Vec<String> = reader.lines().filter_map(|l| l.ok()).collect();
    let total_lines = lines.len();

    let all_records: Vec<InboxLogRecord> = lines
        .iter()
        .filter_map(|line| serde_json::from_str::<InboxLogRecord>(line).ok())
        .collect();

    const LIMIT: usize = 200;
    let is_truncated = cursor.is_some() && cursor.unwrap() > total_lines;
    let start = match cursor {
        Some(c) if !is_truncated => c,
        _ => {
            if all_records.len() > LIMIT {
                all_records.len() - LIMIT
            } else {
                0
            }
        }
    };

    let slice: Vec<InboxLogRecord> = all_records.into_iter().skip(start).take(LIMIT).collect();

    let consumed = slice.len();
    let next_cursor = start + consumed;

    Ok(InboxLogPage {
        records: slice,
        next_cursor,
        total_lines,
        reset: is_truncated,
    })
}

/// Run health diagnostics for WSL environment.
#[tauri::command]
fn health_check() -> Result<HealthResult, String> {
    let root = get_project_root()?;

    // WSL detection
    let (wsl_detected, wsl_distro) = detect_wsl();

    // tmux
    let (tmux_available, tmux_version) = check_command("tmux", &["-V"]);

    // python3
    let (python3_available, python3_version) = check_command("python3", &["--version"]);

    // Script executability
    let required_scripts = vec![
        "inbox_write.sh",
        "inbox_read.sh",
        "send_report.sh",
        "send_task.sh",
    ];
    let scripts_executable: Vec<ScriptStatus> = required_scripts
        .iter()
        .map(|name| {
            let path = root.join("scripts").join(name);
            ScriptStatus {
                name: name.to_string(),
                executable: path.exists() && is_executable(&path),
            }
        })
        .collect();

    // Inbox access
    let inbox_dir = root.join("queue/inbox");
    let inbox_readable = inbox_dir.exists() && inbox_dir.is_dir();
    let inbox_writable = if inbox_readable {
        // Try to check write permission
        let test_file = inbox_dir.join(".write_test");
        match std::fs::write(&test_file, "") {
            Ok(_) => {
                let _ = std::fs::remove_file(&test_file);
                true
            }
            Err(_) => false,
        }
    } else {
        false
    };

    Ok(HealthResult {
        wsl_detected,
        wsl_distro,
        tmux_available,
        tmux_version,
        python3_available,
        python3_version,
        scripts_executable,
        inbox_readable,
        inbox_writable,
    })
}

/// Returns whitelisted model options from config/models.yaml.
#[tauri::command]
fn read_model_options() -> Result<Vec<String>, String> {
    let root = get_project_root()?;
    let path = root.join("config/models.yaml");

    if !path.exists() {
        return Ok(vec![]);
    }

    let raw =
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read models.yaml: {}", e))?;
    let parsed: ModelsYaml =
        serde_yaml::from_str(&raw).map_err(|e| format!("Invalid models.yaml: {}", e))?;

    let mut options: Vec<String> = parsed.model_definitions.into_values().collect();
    options.sort();
    Ok(options)
}

/// Switch agent model via .opencode/skills/switch-model/scripts/switch.sh.
#[tauri::command]
fn switch_agent_model(agent: String, label: String) -> Result<String, String> {
    if !MODEL_SWITCH_TARGETS.contains(&agent.as_str()) {
        return Err(format!("Invalid agent: {}", agent));
    }

    let root = get_project_root()?;
    let model_options = read_model_options()?;
    if !model_options.contains(&label) {
        return Err(format!("Invalid model label: {}", label));
    }

    let script = root.join(".opencode/skills/switch-model/scripts/switch.sh");
    let output = Command::new("bash")
        .arg(&script)
        .arg(&agent)
        .arg(&label)
        .current_dir(&root)
        .output()
        .map_err(|e| format!("Failed to execute switch.sh: {}", e))?;

    if output.status.success() {
        Ok(format!("Switched {} to {}", agent, label))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if stderr.is_empty() {
            "switch.sh failed".to_string()
        } else {
            format!("switch.sh failed: {}", stderr)
        })
    }
}

/// Capture tmux panes for all agents.
#[tauri::command]
fn get_tmux_panes() -> Result<Vec<TmuxPane>, String> {
    let agents = vec![
        "noctis",
        "lunafreya",
        "ignis",
        "gladiolus",
        "prompto",
        "iris",
    ];
    let mut panes = Vec::new();

    for (i, agent) in agents.iter().enumerate() {
        let target = format!("ff15:main.{}", i);
        let output = Command::new("tmux")
            .args(&["capture-pane", "-t", &target, "-p", "-e"])
            .output();

        match output {
            Ok(out) if out.status.success() => {
                let content = String::from_utf8_lossy(&out.stdout).to_string();
                panes.push(TmuxPane {
                    name: agent.to_string(),
                    content,
                });
            }
            _ => {
                // If a pane is not found or fails, return a placeholder or skip
                panes.push(TmuxPane {
                    name: agent.to_string(),
                    content: "ERROR: Pane not found or tmux not running.".to_string(),
                });
            }
        }
    }

    Ok(panes)
}

#[tauri::command]
fn open_folder(path: String) -> Result<(), String> {
    let path_buf = PathBuf::from(&path);
    if !path_buf.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    let output = Command::new("explorer.exe")
        .arg(".")
        .current_dir(&path_buf)
        .output()
        .map_err(|e| format!("Failed to launch explorer.exe: {}", e))?;

    if output.status.success() || output.status.code() == Some(1) {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Err(if stderr.is_empty() {
        "Failed to open folder in Explorer".to_string()
    } else {
        format!("Failed to open folder in Explorer: {}", stderr)
    })
}

#[tauri::command]
fn open_project_in_vscode(path: String, preference: String) -> Result<(), String> {
    let path_buf = PathBuf::from(&path);
    if !path_buf.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    match preference.as_str() {
        "wsl" => run_command("code", &[path.as_str()], Some(&path_buf)),
        "auto" if !is_windows_mounted_path(&path) => {
            run_command("code", &[path.as_str()], Some(&path_buf))
        }
        "auto" | "windows" if is_windows_mounted_path(&path) => {
            let windows_path = run_command_for_output("wslpath", &["-w", path.as_str()], None)?;
            run_command(
                "cmd.exe",
                &["/C", "code", windows_path.as_str()],
                Some(&path_buf),
            )
        }
        "auto" | "windows" => {
            let (_, distro) = detect_wsl();
            if distro.is_empty() {
                return Err("WSL distro could not be detected".to_string());
            }

            let folder_uri = format!("vscode-remote://wsl+{}{}", distro, path);
            run_command(
                "cmd.exe",
                &["/C", "code", "--folder-uri", folder_uri.as_str()],
                Some(&path_buf),
            )
        }
        _ => Err(format!("Invalid VS Code preference: {}", preference)),
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn validate_session_binding_agent(agent: &str) -> Result<(), String> {
    if !MODEL_SWITCH_TARGETS.contains(&agent) {
        return Err(format!("Invalid session binding agent: {}", agent));
    }
    Ok(())
}

fn is_direct_session_transport_supported(_agent: &str) -> bool {
    false
}

fn empty_runtime_target_state() -> RuntimeTargetStateFile {
    RuntimeTargetStateFile {
        schema_version: 1,
        updated_at: current_iso_timestamp(),
        agents: std::collections::HashMap::new(),
    }
}

fn load_runtime_target_state(root: &PathBuf) -> Result<RuntimeTargetStateFile, String> {
    let path = root.join(RUNTIME_TARGET_STATE_PATH);
    if !path.exists() {
        return Ok(empty_runtime_target_state());
    }

    let raw = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read runtime target state: {}", e))?;
    let mut state: RuntimeTargetStateFile = serde_json::from_str(&raw)
        .map_err(|e| format!("Failed to parse runtime target state JSON: {}", e))?;
    if state.schema_version == 0 {
        state.schema_version = 1;
    }
    if state.updated_at.trim().is_empty() {
        state.updated_at = current_iso_timestamp();
    }

    for target in state.agents.values_mut() {
        if target.updated_at.trim().is_empty() {
            target.updated_at = current_iso_timestamp();
        }
    }

    Ok(state)
}

fn save_runtime_target_state(root: &PathBuf, state: &RuntimeTargetStateFile) -> Result<(), String> {
    let path = root.join(RUNTIME_TARGET_STATE_PATH);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create runtime target state directory: {}", e))?;
    }

    let mut normalized = state.clone();
    normalized.schema_version = 1;
    normalized.updated_at = current_iso_timestamp();
    for target in normalized.agents.values_mut() {
        if target.updated_at.trim().is_empty() {
            target.updated_at = normalized.updated_at.clone();
        }
    }

    let json = serde_json::to_string_pretty(&normalized)
        .map_err(|e| format!("Failed to serialize runtime target state: {}", e))?;
    std::fs::write(&path, json)
        .map_err(|e| format!("Failed to write runtime target state: {}", e))?;
    Ok(())
}

fn runtime_target_snapshot(agent: &str, state: &AgentRuntimeTargetState) -> RuntimeTargetSnapshot {
    RuntimeTargetSnapshot {
        agent: agent.to_string(),
        checked_at: state.checked_at.clone(),
        confirmed_at: state.confirmed_at.clone(),
        selected_thread_id: state.selected_thread_id.clone(),
        selected_session_id: state.selected_session_id.clone(),
        transport_mode: state.transport_mode.clone(),
        switch_status: state.switch_status.clone(),
        direct_session_supported: is_direct_session_transport_supported(agent),
        inbox_fallback_available: true,
        last_error: state.last_error.clone(),
        updated_at: state.updated_at.clone(),
    }
}

fn set_runtime_target_state(
    state_file: &mut RuntimeTargetStateFile,
    agent: &str,
    selected_thread_id: Option<String>,
    selected_session_id: Option<String>,
    transport_mode: RuntimeTargetTransportMode,
    switch_status: RuntimeTargetSwitchStatus,
    last_error: Option<String>,
) -> RuntimeTargetSnapshot {
    let updated_at = current_iso_timestamp();
    let checked_at = Some(updated_at.clone());
    let confirmed_at = if transport_mode == RuntimeTargetTransportMode::DirectSession
        && switch_status == RuntimeTargetSwitchStatus::Ready
    {
        Some(updated_at.clone())
    } else {
        None
    };
    let state = AgentRuntimeTargetState {
        checked_at,
        confirmed_at,
        selected_thread_id,
        selected_session_id,
        transport_mode,
        switch_status,
        last_error,
        updated_at,
    };
    state_file.agents.insert(agent.to_string(), state.clone());
    runtime_target_snapshot(agent, &state)
}

fn ensure_runtime_target_state(
    state_file: &mut RuntimeTargetStateFile,
    agent: &str,
    binding_state: &AgentSessionThreadState,
    fallback_error: Option<String>,
) -> RuntimeTargetSnapshot {
    let selected_thread_id = binding_state.selected_thread_id.clone();
    let selected_thread = selected_thread_id.as_ref().and_then(|thread_id| {
        binding_state
            .threads
            .iter()
            .find(|thread| &thread.thread_id == thread_id)
    });
    let selected_session_id =
        selected_thread.and_then(|thread| thread.binding.latest_session_id.clone());

    if let Some(existing) = state_file.agents.get(agent).cloned() {
        let same_thread = existing.selected_thread_id == selected_thread_id;
        let same_session = existing.selected_session_id == selected_session_id;
        if same_thread && same_session {
            return runtime_target_snapshot(agent, &existing);
        }
    }

    let switch_status = if selected_session_id.is_some() {
        RuntimeTargetSwitchStatus::Idle
    } else {
        RuntimeTargetSwitchStatus::Unset
    };
    let transport_mode = if selected_session_id.is_some() {
        RuntimeTargetTransportMode::InboxFallback
    } else {
        RuntimeTargetTransportMode::Unsupported
    };
    let last_error = fallback_error.or_else(|| {
        if selected_session_id.is_some() {
            Some(
                "Direct Crystal session transport is unsupported in the current Tauri runtime boundary; inbox fallback remains available."
                    .to_string(),
            )
        } else {
            None
        }
    });

    set_runtime_target_state(
        state_file,
        agent,
        selected_thread_id,
        selected_session_id,
        transport_mode,
        switch_status,
        last_error,
    )
}

fn empty_session_thread_index() -> SessionThreadIndex {
    SessionThreadIndex {
        schema_version: 1,
        updated_at: current_iso_timestamp(),
        agents: std::collections::HashMap::new(),
    }
}

fn load_session_thread_index(root: &PathBuf) -> Result<SessionThreadIndex, String> {
    let path = root.join(SESSION_THREAD_INDEX_PATH);
    if !path.exists() {
        return migrate_legacy_session_thread_index(root);
    }

    let raw = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read session thread index: {}", e))?;
    let mut index: SessionThreadIndex = serde_json::from_str(&raw)
        .map_err(|e| format!("Failed to parse session thread index JSON: {}", e))?;
    if index.schema_version == 0 {
        index.schema_version = 1;
    }
    if index.updated_at.trim().is_empty() {
        index.updated_at = current_iso_timestamp();
    }

    let agent_names = index.agents.keys().cloned().collect::<Vec<_>>();
    for agent in agent_names {
        if let Some(state) = index.agents.get(&agent).cloned() {
            index
                .agents
                .insert(agent.clone(), sanitize_agent_thread_state(&agent, state)?);
        }
    }
    Ok(index)
}

fn migrate_legacy_session_thread_index(root: &PathBuf) -> Result<SessionThreadIndex, String> {
    let legacy_path = root.join(LEGACY_SESSION_THREAD_INDEX_PATH);
    if !legacy_path.exists() {
        return Ok(empty_session_thread_index());
    }

    let raw = std::fs::read_to_string(&legacy_path)
        .map_err(|e| format!("Failed to read legacy session thread index: {}", e))?;
    let legacy: LegacySessionThreadIndex = serde_json::from_str(&raw)
        .map_err(|e| format!("Failed to parse legacy session thread index JSON: {}", e))?;

    let mut index = empty_session_thread_index();
    for (agent, state) in legacy.agents {
        let converted = convert_legacy_agent_state(&agent, state);
        index.agents.insert(
            agent.clone(),
            sanitize_agent_thread_state(&agent, converted)?,
        );
    }

    save_session_thread_index(root, &index)?;
    let _ = std::fs::remove_file(&legacy_path);
    Ok(index)
}

fn save_session_thread_index(root: &PathBuf, index: &SessionThreadIndex) -> Result<(), String> {
    let path = root.join(SESSION_THREAD_INDEX_PATH);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create state directory: {}", e))?;
    }

    let normalized = normalize_index_before_save(index)?;
    let json = serde_json::to_string_pretty(&normalized)
        .map_err(|e| format!("Failed to serialize session thread index: {}", e))?;
    std::fs::write(&path, json)
        .map_err(|e| format!("Failed to write session thread index: {}", e))?;
    Ok(())
}

fn normalize_index_before_save(index: &SessionThreadIndex) -> Result<SessionThreadIndex, String> {
    let mut normalized = SessionThreadIndex {
        schema_version: 1,
        updated_at: current_iso_timestamp(),
        agents: std::collections::HashMap::new(),
    };

    for (agent, state) in &index.agents {
        normalized.agents.insert(
            agent.clone(),
            sanitize_agent_thread_state(agent, state.clone())?,
        );
    }

    Ok(normalized)
}

fn ensure_agent_session_binding_state(
    index: &mut SessionThreadIndex,
    root: &PathBuf,
    agent: &str,
) -> Result<AgentSessionThreadState, String> {
    let bootstrapped = bootstrap_agent_session_binding_state(root, agent)?;
    let entry = index
        .agents
        .entry(agent.to_string())
        .or_insert_with(|| bootstrapped.clone());

    merge_bootstrapped_threads(entry, &bootstrapped.threads);
    if entry.selected_thread_id.is_none() {
        entry.selected_thread_id = bootstrapped.selected_thread_id.clone();
    }

    let sanitized = sanitize_agent_thread_state(agent, entry.clone())?;
    *entry = sanitized.clone();
    Ok(sanitized)
}

fn bootstrap_agent_session_binding_state(
    root: &PathBuf,
    agent: &str,
) -> Result<AgentSessionThreadState, String> {
    let summaries = read_agent_session_summaries(root, agent)?;
    let threads = summaries
        .into_iter()
        .map(|summary| SessionThreadRecord {
            agent: agent.to_string(),
            binding: SessionThreadBinding {
                latest_session_id: Some(summary.session_id.clone()),
                rebound_from_session_id: None,
                status: if summary.is_active {
                    ThreadBindingState::Active
                } else {
                    ThreadBindingState::Saved
                },
                updated_at: summary.last_activity_at.clone(),
            },
            updated_at: summary.last_activity_at.clone(),
            last_activity_at: summary.last_activity_at.clone(),
            message_count: summary.message_count,
            preview: summary.preview.clone(),
            session_ids: vec![summary.session_id.clone()],
            started_at: summary.started_at.clone(),
            thread_id: build_thread_id(agent, &summary.session_id),
            title: summary.preview.clone(),
        })
        .collect::<Vec<_>>();

    let selected_thread_id = threads.first().map(|thread| thread.thread_id.clone());

    Ok(AgentSessionThreadState {
        selected_thread_id,
        threads,
    })
}

fn merge_bootstrapped_threads(
    state: &mut AgentSessionThreadState,
    bootstrapped_threads: &[SessionThreadRecord],
) {
    for thread in bootstrapped_threads {
        let exists = state.threads.iter().any(|existing| {
            existing.thread_id == thread.thread_id
                || existing
                    .session_ids
                    .iter()
                    .any(|session_id| thread.session_ids.iter().any(|item| item == session_id))
        });

        if !exists {
            state.threads.push(thread.clone());
        }
    }
}

fn sanitize_agent_thread_state(
    agent: &str,
    mut state: AgentSessionThreadState,
) -> Result<AgentSessionThreadState, String> {
    validate_session_binding_agent(agent)?;

    for thread in &mut state.threads {
        thread.agent = agent.to_string();
        if thread.thread_id.trim().is_empty() {
            let session_id = thread
                .binding
                .latest_session_id
                .clone()
                .or_else(|| thread.session_ids.first().cloned())
                .unwrap_or_else(|| format!("{}-thread", agent));
            thread.thread_id = build_thread_id(agent, &session_id);
        }

        thread
            .session_ids
            .retain(|session_id| !session_id.trim().is_empty());
        thread.session_ids.dedup();

        if let Some(latest_session_id) = thread.binding.latest_session_id.clone() {
            if !thread
                .session_ids
                .iter()
                .any(|item| item == &latest_session_id)
            {
                thread.session_ids.push(latest_session_id);
            }
        } else if let Some(last_session_id) = thread.session_ids.last().cloned() {
            thread.binding.latest_session_id = Some(last_session_id);
        }

        if thread.updated_at.trim().is_empty() {
            thread.updated_at = current_iso_timestamp();
        }
        if thread.started_at.trim().is_empty() {
            thread.started_at = thread.updated_at.clone();
        }
        if thread.last_activity_at.trim().is_empty() {
            thread.last_activity_at = thread.updated_at.clone();
        }
        if thread.title.trim().is_empty() {
            thread.title = thread.preview.clone();
        }
        if thread.binding.updated_at.trim().is_empty() {
            thread.binding.updated_at = thread.updated_at.clone();
        }
    }

    state.threads.sort_by(|left, right| {
        right
            .updated_at
            .cmp(&left.updated_at)
            .then(left.thread_id.cmp(&right.thread_id))
    });

    if let Some(selected_thread_id) = state.selected_thread_id.clone() {
        let exists = state
            .threads
            .iter()
            .any(|thread| thread.thread_id == selected_thread_id);
        if !exists {
            state.selected_thread_id = state.threads.first().map(|thread| thread.thread_id.clone());
        }
    } else {
        state.selected_thread_id = state.threads.first().map(|thread| thread.thread_id.clone());
    }

    Ok(state)
}

struct ImportedAgentSessionBindingState {
    agent: String,
    state: AgentSessionThreadState,
}

fn import_agent_session_binding_state(
    state: AgentSessionBindingState,
) -> Result<ImportedAgentSessionBindingState, String> {
    validate_session_binding_agent(&state.agent)?;
    Ok(ImportedAgentSessionBindingState {
        agent: state.agent,
        state: AgentSessionThreadState {
            selected_thread_id: state.selected_thread_id,
            threads: state.threads,
        },
    })
}

fn export_agent_session_binding_state(
    agent: &str,
    state: &AgentSessionThreadState,
    runtime_target: Option<RuntimeTargetSnapshot>,
) -> AgentSessionBindingState {
    AgentSessionBindingState {
        agent: agent.to_string(),
        selected_thread_id: state.selected_thread_id.clone(),
        threads: state.threads.clone(),
        runtime_target,
    }
}

fn convert_legacy_agent_state(
    agent: &str,
    state: LegacyAgentSessionBindingState,
) -> AgentSessionThreadState {
    let threads = state
        .threads
        .into_iter()
        .map(|thread| convert_legacy_thread_record(agent, thread))
        .collect::<Vec<_>>();

    AgentSessionThreadState {
        selected_thread_id: state.selected_thread_id.map(|thread_id| {
            if let Some(session_id) = extract_legacy_thread_session_id(&thread_id) {
                build_thread_id(agent, &session_id)
            } else {
                thread_id
            }
        }),
        threads,
    }
}

fn convert_legacy_thread_record(
    agent: &str,
    thread: LegacySessionThreadRecord,
) -> SessionThreadRecord {
    let latest_session_id = thread
        .latest_session_id
        .clone()
        .or_else(|| thread.session_ids.last().cloned());
    let rebound_from_session_id = thread.previous_session_id.clone();
    let preview = thread.preview.clone();
    let updated_at = if thread.updated_at.trim().is_empty() {
        current_iso_timestamp()
    } else {
        thread.updated_at.clone()
    };
    let started_at = if thread.started_at.trim().is_empty() {
        current_iso_timestamp()
    } else {
        thread.started_at.clone()
    };
    let last_activity_at = if thread.last_activity_at.trim().is_empty() {
        current_iso_timestamp()
    } else {
        thread.last_activity_at.clone()
    };
    let thread_id = latest_session_id
        .as_deref()
        .map(|session_id| build_thread_id(agent, session_id))
        .unwrap_or(thread.thread_id);

    SessionThreadRecord {
        agent: agent.to_string(),
        binding: SessionThreadBinding {
            latest_session_id,
            rebound_from_session_id,
            status: thread.binding_state,
            updated_at: updated_at.clone(),
        },
        last_activity_at,
        message_count: thread.session_ids.len().max(1),
        preview: preview.clone(),
        session_ids: thread.session_ids,
        started_at,
        thread_id,
        title: preview,
        updated_at,
    }
}

fn extract_legacy_thread_session_id(thread_id: &str) -> Option<String> {
    let parts = thread_id.split(':').collect::<Vec<_>>();
    if parts.len() >= 3 && parts.first().copied() == Some("thread") {
        Some(parts[2..].join(":"))
    } else {
        None
    }
}

fn build_thread_id(agent: &str, session_id: &str) -> String {
    let hash = sha1_hex(&format!("{}:{}", agent, session_id));
    format!("thread_{}_{}", agent, &hash[..12])
}

fn sha1_hex(input: &str) -> String {
    let mut child = Command::new("sha1sum")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .or_else(|_| {
            Command::new("shasum")
                .args(["-a", "1"])
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .spawn()
        })
        .expect("sha1 command unavailable");

    if let Some(stdin) = child.stdin.as_mut() {
        let _ = stdin.write_all(input.as_bytes());
    }

    let output = child.wait_with_output().expect("sha1 command failed");
    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout
        .split_whitespace()
        .next()
        .unwrap_or("0000000000000000000000000000000000000000")
        .to_string()
}

fn read_agent_session_summaries(
    root: &PathBuf,
    agent: &str,
) -> Result<Vec<ChatSessionSummary>, String> {
    let log_path = root.join(CHAT_LOG_PATH);
    if !log_path.exists() {
        return Ok(vec![]);
    }

    let file =
        std::fs::File::open(&log_path).map_err(|e| format!("Failed to open log file: {}", e))?;
    let reader = BufReader::new(file);

    let records: Vec<ChatLogRecord> = reader
        .lines()
        .filter_map(|line| line.ok())
        .filter_map(|line| serde_json::from_str::<ChatLogRecord>(&line).ok())
        .filter(|record| record.agent == agent)
        .collect();

    Ok(build_chat_session_summaries(&records, agent))
}

fn candidate_session_id(thread: &SessionThreadRecord) -> Option<String> {
    thread
        .binding
        .latest_session_id
        .clone()
        .or_else(|| thread.session_ids.last().cloned())
}

fn sync_selected_thread_binding(
    root: &PathBuf,
    agent: &str,
    state: &mut AgentSessionThreadState,
) -> Result<(), String> {
    let Some(selected_thread_id) = state.selected_thread_id.clone() else {
        return Ok(());
    };

    let Some(thread) = state
        .threads
        .iter_mut()
        .find(|thread| thread.thread_id == selected_thread_id)
    else {
        return Ok(());
    };

    let _ = refresh_thread_binding(root, agent, thread, false)?;
    Ok(())
}

fn refresh_thread_binding(
    root: &PathBuf,
    agent: &str,
    thread: &mut SessionThreadRecord,
    activate_if_reachable: bool,
) -> Result<Option<String>, String> {
    let checked_at = current_iso_timestamp();
    let session_id = candidate_session_id(thread);
    let runtime_status = match session_id.as_deref() {
        Some(session_id) => fetch_runtime_status(root, agent, session_id).ok().flatten(),
        None => None,
    };

    thread.binding.status = match session_id.as_deref() {
        Some(session_id) if is_session_reachable(root, agent, session_id)? => {
            if activate_if_reachable {
                let session_reference =
                    resolve_session_selection_reference(root, agent, session_id)
                        .unwrap_or_else(|_| session_id.to_string());
                activate_runtime_session(root, agent, &session_reference)?;
            }
            ThreadBindingState::Active
        }
        Some(_) => ThreadBindingState::Missing,
        None => ThreadBindingState::Saved,
    };
    thread.binding.updated_at = checked_at.clone();
    thread.updated_at = checked_at;

    Ok(runtime_status)
}

fn build_resume_prompt(
    agent: &str,
    thread: &SessionThreadRecord,
    previous_session_id: Option<&str>,
) -> String {
    let thread_title = if thread.title.trim().is_empty() {
        thread.preview.trim()
    } else {
        thread.title.trim()
    };
    let lineage = if thread.session_ids.is_empty() {
        "none recorded".to_string()
    } else {
        thread.session_ids.join(", ")
    };
    let previous_session_label = previous_session_id.unwrap_or("unknown");

    format!(
        "Resume the missing `{}` thread in this fresh runtime session. The previous bound session `{}` is unavailable, so no hidden runtime memory was restored. Read recent history first from `runtime/logs/agent-chat-monitor.jsonl` for agent `{}` and thread `{}` (title: `{}`; prior session lineage: {}). If recent history is not enough, inspect earlier history for the same thread before continuing.",
        agent,
        previous_session_label,
        agent,
        thread.thread_id,
        thread_title,
        lineage
    )
}

fn current_iso_timestamp() -> String {
    Command::new("date")
        .arg("+%Y-%m-%dT%H:%M:%S%:z")
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| {
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|duration| format!("{}", duration.as_secs()))
                .unwrap_or_else(|_| "0".to_string())
        })
}

fn current_timestamp_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn read_opencode_endpoint(root: &PathBuf, agent: &str) -> Result<RuntimeOpencodeEndpoint, String> {
    let manifest_path = root.join("runtime/opencode-endpoints.json");
    let raw = std::fs::read_to_string(&manifest_path)
        .map_err(|e| format!("Failed to read OpenCode endpoints manifest: {}", e))?;
    let manifest: RuntimeOpencodeManifest = serde_json::from_str(&raw)
        .map_err(|e| format!("Failed to parse OpenCode endpoints manifest: {}", e))?;
    manifest
        .agents
        .get(agent)
        .cloned()
        .ok_or_else(|| format!("OpenCode endpoint not found for agent: {}", agent))
}

fn build_agent_url(root: &PathBuf, agent: &str, path: &str) -> Result<String, String> {
    let endpoint = read_opencode_endpoint(root, agent)?;
    Ok(format!(
        "{}{}?directory={}",
        endpoint.base_url.trim_end_matches('/'),
        path,
        root.display()
    ))
}

fn run_curl_json(method: &str, url: &str, body: Option<&str>) -> Result<(u16, String), String> {
    let mut args = vec![
        "-sS".to_string(),
        "-X".to_string(),
        method.to_string(),
        "-H".to_string(),
        "Accept: application/json".to_string(),
    ];

    if let Some(body) = body {
        args.push("-H".to_string());
        args.push("Content-Type: application/json".to_string());
        args.push("--data".to_string());
        args.push(body.to_string());
    }

    args.push("-w".to_string());
    args.push("\n%{http_code}".to_string());
    args.push(url.to_string());

    let output = Command::new("curl")
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to execute curl: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    let (body_text, status_text) = stdout
        .rsplit_once('\n')
        .map(|(body, status)| (body.to_string(), status.trim().to_string()))
        .unwrap_or_else(|| (stdout.clone(), "0".to_string()));

    let status_code = status_text.parse::<u16>().unwrap_or(0);

    if !output.status.success() && status_code == 0 {
        return Err(if stderr.is_empty() {
            format!("curl failed for {} {}", method, url)
        } else {
            format!("curl failed for {} {}: {}", method, url, stderr)
        });
    }

    Ok((status_code, body_text))
}

fn fetch_runtime_status(
    root: &PathBuf,
    agent: &str,
    session_id: &str,
) -> Result<Option<String>, String> {
    let url = build_agent_url(root, agent, "/session/status")?;
    let (status_code, body) = run_curl_json("GET", &url, None)?;
    if !(200..300).contains(&status_code) {
        return Ok(None);
    }

    let statuses: std::collections::HashMap<String, SessionStatusRecord> =
        serde_json::from_str(&body).unwrap_or_default();
    Ok(statuses
        .get(session_id)
        .and_then(|record| record.status_type.clone()))
}

fn is_session_reachable(root: &PathBuf, agent: &str, session_id: &str) -> Result<bool, String> {
    let url = build_agent_url(root, agent, &format!("/session/{}", session_id))?;
    let (status_code, _) = run_curl_json("GET", &url, None)?;
    if status_code == 404 {
        return Ok(false);
    }
    if (200..300).contains(&status_code) {
        return Ok(true);
    }

    Err(format!(
        "Failed to resolve session {} for {} (HTTP {})",
        session_id, agent, status_code
    ))
}

struct CreatedRuntimeSession {
    session_id: String,
}

fn create_runtime_session(root: &PathBuf, agent: &str) -> Result<CreatedRuntimeSession, String> {
    let timestamp = current_timestamp_millis();
    let title = format!("Session {} {}", agent, timestamp);
    let body = serde_json::json!({ "title": title }).to_string();
    let url = build_agent_url(root, agent, "/session")?;
    let (status_code, response_body) = run_curl_json("POST", &url, Some(&body))?;
    if !(200..300).contains(&status_code) {
        return Err(format!(
            "Failed to create runtime session for {} (HTTP {}): {}",
            agent, status_code, response_body
        ));
    }

    let json: serde_json::Value = serde_json::from_str(&response_body)
        .map_err(|e| format!("Failed to parse create session response: {}", e))?;
    let session_id = json
        .get("data")
        .and_then(|data| data.get("id"))
        .and_then(|value| value.as_str())
        .or_else(|| json.get("id").and_then(|value| value.as_str()))
        .ok_or_else(|| "Create session response did not include session id".to_string())?
        .to_string();

    activate_runtime_session(root, agent, &title)?;

    Ok(CreatedRuntimeSession { session_id })
}

fn activate_runtime_session(
    root: &PathBuf,
    agent: &str,
    session_reference: &str,
) -> Result<(), String> {
    open_agent_sessions_dialog(root, agent)?;
    select_tmux_session(agent, session_reference)?;
    Ok(())
}

fn resolve_session_selection_reference(
    root: &PathBuf,
    agent: &str,
    session_id: &str,
) -> Result<String, String> {
    let url = build_agent_url(root, agent, &format!("/session/{}", session_id))?;
    let (status_code, body) = run_curl_json("GET", &url, None)?;
    if !(200..300).contains(&status_code) {
        return Err(format!(
            "Failed to fetch session {} for {} (HTTP {})",
            session_id, agent, status_code
        ));
    }

    let json: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse session response: {}", e))?;
    Ok(json
        .get("data")
        .and_then(|data| data.get("title"))
        .and_then(|value| value.as_str())
        .or_else(|| json.get("title").and_then(|value| value.as_str()))
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| session_id.to_string()))
}

fn tmux_target_for_agent(agent: &str) -> Option<String> {
    let pane = match agent {
        "noctis" => Some(0),
        "lunafreya" => Some(1),
        "ignis" => Some(2),
        "gladiolus" => Some(3),
        "prompto" => Some(4),
        _ => None,
    }?;

    Some(format!("ff15:main.{}", pane))
}

fn open_agent_sessions_dialog(root: &PathBuf, agent: &str) -> Result<(), String> {
    let url = build_agent_url(root, agent, "/tui/open-sessions")?;
    let (status_code, body) = run_curl_json("POST", &url, None)?;
    if (200..300).contains(&status_code) {
        Ok(())
    } else {
        Err(format!(
            "Failed to open sessions dialog for {} (HTTP {}): {}",
            agent, status_code, body
        ))
    }
}

fn select_tmux_session(agent: &str, session_reference: &str) -> Result<(), String> {
    let Some(target) = tmux_target_for_agent(agent) else {
        return Ok(());
    };

    std::thread::sleep(Duration::from_millis(500));
    let _ = Command::new("tmux")
        .args(["send-keys", "-t", target.as_str(), session_reference])
        .output();
    std::thread::sleep(Duration::from_millis(100));
    let _ = Command::new("tmux")
        .args(["send-keys", "-t", target.as_str(), "Enter"])
        .output();
    std::thread::sleep(Duration::from_millis(300));
    Ok(())
}

fn send_tmux_prompt(agent: &str, prompt: &str) -> Result<(), String> {
    let Some(target) = tmux_target_for_agent(agent) else {
        return Ok(());
    };

    let prompt = prompt.trim();
    if prompt.is_empty() {
        return Ok(());
    }

    Command::new("tmux")
        .args(["send-keys", "-t", target.as_str(), prompt])
        .output()
        .map_err(|e| format!("Failed to send resume prompt to tmux: {}", e))?;
    std::thread::sleep(Duration::from_millis(100));
    Command::new("tmux")
        .args(["send-keys", "-t", target.as_str(), "Enter"])
        .output()
        .map_err(|e| format!("Failed to submit resume prompt in tmux: {}", e))?;
    Ok(())
}

fn record_runtime_target_transition(
    root: &PathBuf,
    agent: &str,
    thread_id: Option<String>,
    session_id: Option<String>,
    transport_mode: RuntimeTargetTransportMode,
    switch_status: RuntimeTargetSwitchStatus,
    last_error: Option<String>,
    event: &str,
    content: &str,
) -> Result<(), String> {
    let audit_session_id = session_id
        .clone()
        .unwrap_or_else(|| "runtime-target".to_string());
    append_chat_status_record(
        root,
        agent,
        &audit_session_id,
        event,
        content,
        Some(serde_json::json!({
            "threadId": thread_id,
            "sessionId": session_id,
            "transportMode": transport_mode,
            "switchStatus": switch_status,
            "lastError": last_error,
            "source": "crystal_chat_runtime_target",
        })),
    )
}

fn append_chat_status_record(
    root: &PathBuf,
    agent: &str,
    session_id: &str,
    event: &str,
    content: &str,
    data: Option<serde_json::Value>,
) -> Result<(), String> {
    let log_path = root.join(CHAT_LOG_PATH);
    if let Some(parent) = log_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create log directory: {}", e))?;
    }

    let pane = match agent {
        "noctis" => "0",
        "lunafreya" => "1",
        "ignis" => "2",
        "gladiolus" => "3",
        "prompto" => "4",
        "iris" => "5",
        _ => "0",
    };

    let record = serde_json::json!({
        "agent": agent,
        "content": content,
        "id": format!("{}-{}", event, current_timestamp_millis()),
        "kind": "status",
        "meta": {
            "pane": pane,
            "event": event,
        },
        "session_id": session_id,
        "source": "system",
        "ts": current_iso_timestamp(),
        "data": data,
    });

    let line = format!("{}\n", record);
    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|e| format!("Failed to open chat log for append: {}", e))?;
    file.write_all(line.as_bytes())
        .map_err(|e| format!("Failed to append chat status record: {}", e))?;
    Ok(())
}

fn detect_wsl() -> (bool, String) {
    if let Ok(version_info) = std::fs::read_to_string("/proc/version") {
        let lower = version_info.to_lowercase();
        if lower.contains("microsoft") || lower.contains("wsl") {
            let distro = std::env::var("WSL_DISTRO_NAME").unwrap_or_default();
            return (true, distro);
        }
    }
    (false, String::new())
}

fn check_command(cmd: &str, args: &[&str]) -> (bool, String) {
    match Command::new(cmd).args(args).output() {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            (true, stdout)
        }
        _ => (false, String::new()),
    }
}

fn run_command(cmd: &str, args: &[&str], cwd: Option<&PathBuf>) -> Result<(), String> {
    let mut command = Command::new(cmd);
    command.args(args);

    if let Some(dir) = cwd {
        command.current_dir(dir);
    }

    let output = command
        .output()
        .map_err(|e| format!("Failed to execute {}: {}", cmd, e))?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let detail = if !stderr.is_empty() { stderr } else { stdout };

    Err(if detail.is_empty() {
        format!("{} exited with status {}", cmd, output.status)
    } else {
        format!("{} failed: {}", cmd, detail)
    })
}

fn run_command_for_output(
    cmd: &str,
    args: &[&str],
    cwd: Option<&PathBuf>,
) -> Result<String, String> {
    let mut command = Command::new(cmd);
    command.args(args);

    if let Some(dir) = cwd {
        command.current_dir(dir);
    }

    let output = command
        .output()
        .map_err(|e| format!("Failed to execute {}: {}", cmd, e))?;

    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let detail = if !stderr.is_empty() { stderr } else { stdout };

    Err(if detail.is_empty() {
        format!("{} exited with status {}", cmd, output.status)
    } else {
        format!("{} failed: {}", cmd, detail)
    })
}

fn is_windows_mounted_path(path: &str) -> bool {
    let bytes = path.as_bytes();
    bytes.len() >= 8
        && &bytes[0..5] == b"/mnt/"
        && bytes[5].is_ascii_alphabetic()
        && bytes[6] == b'/'
}

fn is_executable(path: &PathBuf) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = std::fs::metadata(path) {
            return meta.permissions().mode() & 0o111 != 0;
        }
    }
    false
}

fn build_chat_session_summaries(records: &[ChatLogRecord], agent: &str) -> Vec<ChatSessionSummary> {
    let mut summaries = std::collections::HashMap::<String, ChatSessionSummary>::new();
    let mut sorted_records = records.to_vec();
    sorted_records.sort_by(|left, right| left.ts.cmp(&right.ts).then(left.id.cmp(&right.id)));

    for record in sorted_records {
        let session_id = record.session_id.trim();
        if session_id.is_empty() {
            continue;
        }

        let preview = get_chat_record_preview(&record);
        let is_active = record.source == "live_stream"
            || record
                .state
                .as_deref()
                .map(|state| matches!(state, "pending" | "running"))
                .unwrap_or(false);

        match summaries.get_mut(session_id) {
            Some(existing) => {
                existing.message_count += 1;

                if record.ts < existing.started_at {
                    existing.started_at = record.ts.clone();
                }

                if record.ts >= existing.last_activity_at {
                    existing.last_activity_at = record.ts.clone();
                    existing.is_active = is_active;
                    if !preview.is_empty() {
                        existing.preview = preview;
                    }
                } else if existing.preview.is_empty() && !preview.is_empty() {
                    existing.preview = preview;
                }
            }
            None => {
                summaries.insert(
                    session_id.to_string(),
                    ChatSessionSummary {
                        agent: agent.to_string(),
                        is_active,
                        last_activity_at: record.ts.clone(),
                        message_count: 1,
                        preview,
                        session_id: session_id.to_string(),
                        started_at: record.ts.clone(),
                    },
                );
            }
        }
    }

    let mut result: Vec<ChatSessionSummary> = summaries.into_values().collect();
    result.sort_by(|left, right| {
        right
            .last_activity_at
            .cmp(&left.last_activity_at)
            .then(left.session_id.cmp(&right.session_id))
    });
    result
}

fn get_chat_record_preview(record: &ChatLogRecord) -> String {
    let mut candidates = Vec::new();
    if let Some(content) = &record.content {
        candidates.push(content.as_str());
    }
    if let Some(title) = &record.title {
        candidates.push(title.as_str());
    }
    candidates.push(record.meta.event.as_str());
    candidates.push(record.kind.as_str());

    for candidate in candidates {
        let trimmed = candidate.split_whitespace().collect::<Vec<_>>().join(" ");
        if trimmed.is_empty() {
            continue;
        }

        return trim_preview(&trimmed, 120);
    }

    String::new()
}

fn trim_preview(value: &str, max_chars: usize) -> String {
    let total_chars = value.chars().count();
    if total_chars <= max_chars {
        return value.to_string();
    }

    let truncated: String = value.chars().take(max_chars.saturating_sub(1)).collect();
    format!("{}…", truncated)
}

// ---------------------------------------------------------------------------
// App entry
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            read_board,
            peek_inbox,
            list_inbox_messages,
            mark_inbox_read,
            mark_all_inbox_read,
            send_message,
            read_agent_chat_logs,
            read_agent_session_history,
            read_agent_session_binding_state,
            read_agent_runtime_target_state,
            write_agent_session_binding_state,
            resolve_agent_session_id,
            resolve_agent_thread_binding,
            recreate_agent_thread_binding,
            resume_agent_thread_binding,
            send_crystal_message,
            read_inbox_log,
            health_check,
            read_model_options,
            switch_agent_model,
            get_tmux_panes,
            open_folder,
            open_project_in_vscode,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
