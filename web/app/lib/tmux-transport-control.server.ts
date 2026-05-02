import { execFile } from "node:child_process";
import { join } from "node:path";
import { getProjectRoot } from "@/lib/get-project-root.server";
import {
  getConfiguredMissionTransportStatus,
  type ConfiguredMissionTransportStatus,
} from "@/lib/tmux-transport-bootstrap.server";

type TmuxTransportAction = "start" | "status" | "stop";

function execFileWithOutput(
  file: string,
  args: string[],
  options: { cwd: string },
): Promise<{ stderr: string; stdout: string }> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { ...options, encoding: "utf-8" }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }

      resolve({ stderr, stdout });
    });
  });
}

async function runTmuxTransportAction(root: string, action: TmuxTransportAction): Promise<void> {
  await execFileWithOutput(
    process.execPath,
    [
      "--experimental-strip-types",
      join(root, "scripts", "tmux_transport_runtime.mts"),
      action,
      "--root",
      root,
    ],
    { cwd: root },
  );
}

export async function restartTmuxTransport(
  root = getProjectRoot(),
): Promise<ConfiguredMissionTransportStatus> {
  const status = await getConfiguredMissionTransportStatus(root);
  if (status.transportMode !== "tmux-resident") {
    throw new Error("Tmux transport restart requires transport_mode=tmux-resident.");
  }

  await runTmuxTransportAction(root, "stop");
  await runTmuxTransportAction(root, "start");

  return getConfiguredMissionTransportStatus(root);
}