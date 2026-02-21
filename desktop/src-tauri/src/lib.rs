use serde::{Deserialize, Serialize};
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

#[derive(Deserialize, Debug)]
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

// ---------------------------------------------------------------------------
// Allowed agents for validation
// ---------------------------------------------------------------------------

const ALLOWED_TARGETS: &[&str] = &["noctis", "lunafreya"];
const ALLOWED_SENDERS: &[&str] = &[
    "crystal", "user", "noctis", "lunafreya", "ignis", "gladiolus", "prompto", "iris",
];

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Read dashboard.md and return its content.
#[tauri::command]
fn read_dashboard() -> Result<String, String> {
    let root = get_project_root()?;
    let path = root.join("dashboard.md");
    std::fs::read_to_string(&path).map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => "dashboard.md not found".to_string(),
        _ => format!("Failed to read dashboard.md: {}", e),
    })
}

/// Run `inbox_read.sh <agent> --peek` and return the unread count.
#[tauri::command]
fn peek_inbox(agent: String) -> Result<u32, String> {
    if !ALLOWED_TARGETS.contains(&agent.as_str()) {
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
    if !ALLOWED_TARGETS.contains(&agent.as_str()) {
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
            read_dashboard,
            peek_inbox,
            list_inbox_messages,
            send_message,
            health_check,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
