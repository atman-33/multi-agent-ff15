use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::Command;

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
    "noctis", "lunafreya", "ignis", "gladiolus", "prompto", "iris", "crystal",
];
const MODEL_SWITCH_TARGETS: &[&str] = &["noctis", "lunafreya", "ignis", "gladiolus", "prompto"];
const ALLOWED_SENDERS: &[&str] = &[
    "crystal", "user", "noctis", "lunafreya", "ignis", "gladiolus", "prompto", "iris",
];

const CHAT_LOG_PATH: &str = "runtime/logs/agent-chat-monitor.jsonl";
const INBOX_LOG_PATH: &str = "runtime/logs/inbox-log.jsonl";

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

    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read inbox: {}", e))?;
    let mut inbox: InboxFile = serde_yaml::from_str(&content)
        .map_err(|e| format!("Failed to parse inbox YAML: {}", e))?;

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

    let yaml_str = serde_yaml::to_string(&inbox)
        .map_err(|e| format!("Failed to serialize YAML: {}", e))?;
    let tmp_path = path.with_extension("yaml.tmp");
    std::fs::write(&tmp_path, &yaml_str)
        .map_err(|e| format!("Failed to write temp file: {}", e))?;
    std::fs::rename(&tmp_path, &path)
        .map_err(|e| format!("Failed to rename temp file: {}", e))?;

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

    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read inbox: {}", e))?;
    let mut inbox: InboxFile = serde_yaml::from_str(&content)
        .map_err(|e| format!("Failed to parse inbox YAML: {}", e))?;

    for msg in &mut inbox.messages {
        msg.read = true;
    }

    let yaml_str = serde_yaml::to_string(&inbox)
        .map_err(|e| format!("Failed to serialize YAML: {}", e))?;
    let tmp_path = path.with_extension("yaml.tmp");
    std::fs::write(&tmp_path, &yaml_str)
        .map_err(|e| format!("Failed to write temp file: {}", e))?;
    std::fs::rename(&tmp_path, &path)
        .map_err(|e| format!("Failed to rename temp file: {}", e))?;

    Ok(())
}

/// Send a message via inbox_write.sh. Arguments passed as array (no shell expansion).
#[tauri::command]
fn send_message(target: String, from: String, content: String) -> Result<String, String> {
    // Validate target
    if !ALLOWED_TARGETS.contains(&target.as_str()) {
        return Err(format!("Invalid target: {}. Allowed: {:?}", target, ALLOWED_TARGETS));
    }

    // Validate sender
    if !ALLOWED_SENDERS.contains(&from.as_str()) {
        return Err(format!("Invalid sender: {}. Allowed: {:?}", from, ALLOWED_SENDERS));
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
/// Returns records from `cursor` line onward (0-based), up to `limit` records.
/// If cursor is None, returns the last `limit` records from the file.
/// Broken/unparseable lines are silently skipped (task 2.2).
#[tauri::command]
fn read_agent_chat_logs(limit: usize, cursor: Option<usize>) -> Result<ChatLogPage, String> {
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

    // Collect all lines (we need total count and optionally the last N).
    let lines: Vec<String> = reader.lines().filter_map(|l| l.ok()).collect();
    let total_lines = lines.len();

    let is_truncated = cursor.is_some() && cursor.unwrap() > total_lines;
    let start = match cursor {
        Some(c) if !is_truncated => c,
        _ => {
            // No cursor or truncated: return last `limit` lines.
            if total_lines > limit {
                total_lines - limit
            } else {
                0
            }
        }
    };

    let slice = if start < total_lines {
        &lines[start..]
    } else {
        &lines[0..0]
    };

    // Parse each line; skip broken lines (task 2.2).
    let records: Vec<ChatLogRecord> = slice
        .iter()
        .take(limit)
        .filter_map(|line| serde_json::from_str::<ChatLogRecord>(line).ok())
        .collect();

    let consumed = slice.len().min(limit);
    let next_cursor = start + consumed;

    Ok(ChatLogPage {
        records,
        next_cursor,
        total_lines,
        reset: is_truncated,
    })
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

    let slice: Vec<InboxLogRecord> = all_records
        .into_iter()
        .skip(start)
        .take(LIMIT)
        .collect();

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

    let raw = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read models.yaml: {}", e))?;
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
fn open_project_in_vscode(path: String, target: String) -> Result<(), String> {
    let path_buf = PathBuf::from(&path);
    if !path_buf.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    match target.as_str() {
        "wsl" => run_command("code", &[path.as_str()], Some(&path_buf)),
        "windows" => {
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
        _ => Err(format!("Invalid VS Code target: {}", target)),
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
