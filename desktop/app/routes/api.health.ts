import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { getProjectRoot } from "@/lib/get-project-root.server";

/**
 * GET /api/health
 * Returns health diagnostics mirroring the Tauri `health_check` command.
 */
export function loader() {
  try {
    const root = getProjectRoot();

    // WSL detection
    let wslDetected = false;
    let wslDistro = "";
    try {
      const procVersion = readFileSync("/proc/version", "utf-8").toLowerCase();
      if (procVersion.includes("microsoft") || procVersion.includes("wsl")) {
        wslDetected = true;
        wslDistro = process.env.WSL_DISTRO_NAME ?? "";
      }
    } catch {
      // Not Linux or /proc/version not readable
    }

    // tmux
    const tmuxResult = spawnSync("tmux", ["-V"], { encoding: "utf-8" });
    const tmuxAvailable = tmuxResult.status === 0;
    const tmuxVersion = (tmuxResult.stdout ?? "").trim();

    // python3
    const pyResult = spawnSync("python3", ["--version"], { encoding: "utf-8" });
    const python3Available = pyResult.status === 0;
    const python3Version = (
      (pyResult.stdout ?? "") + (pyResult.stderr ?? "")
    ).trim();

    // Script executability
    const requiredScripts = [
      "inbox_write.sh",
      "inbox_read.sh",
      "send_report.sh",
      "send_task.sh",
    ];
    const scriptsExecutable = requiredScripts.map((name) => {
      const scriptPath = join(root, "scripts", name);
      let executable = false;
      if (existsSync(scriptPath)) {
        try {
          const mode = statSync(scriptPath).mode;
          // biome-ignore lint/suspicious/noBitwiseOperators: checking file permissions mask
          executable = (mode & 0o111) !== 0;
        } catch {
          // Permission denied or other error
        }
      }
      return { name, executable };
    });

    // Inbox access
    const inboxDir = join(root, "queue/inbox");
    const inboxReadable = existsSync(inboxDir);
    let inboxWritable = false;
    if (inboxReadable) {
      const testFile = join(inboxDir, ".write_test");
      try {
        writeFileSync(testFile, "");
        unlinkSync(testFile);
        inboxWritable = true;
      } catch {
        // Write permission denied
      }
    }

    return Response.json({
      wsl_detected: wslDetected,
      wsl_distro: wslDistro,
      tmux_available: tmuxAvailable,
      tmux_version: tmuxVersion,
      python3_available: python3Available,
      python3_version: python3Version,
      scripts_executable: scriptsExecutable,
      inbox_readable: inboxReadable,
      inbox_writable: inboxWritable,
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
