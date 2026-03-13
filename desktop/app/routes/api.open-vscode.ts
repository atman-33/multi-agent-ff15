import { execFile } from "node:child_process";

type VSCodeTarget = "wsl" | "windows";

function execFileAsync(file: string, args: string[], cwd?: string) {
  return new Promise<void>((resolve, reject) => {
    execFile(file, args, { cwd }, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function isVSCodeTarget(value: unknown): value is VSCodeTarget {
  return value === "wsl" || value === "windows";
}

function getWslFolderUri(path: string): string {
  const distro = process.env.WSL_DISTRO_NAME;
  if (!distro) {
    throw new Error("WSL_DISTRO_NAME is not available");
  }

  return `vscode-remote://wsl+${distro}${path}`;
}

async function openInVSCode(path: string, target: VSCodeTarget) {
  if (target === "wsl") {
    await execFileAsync("code", [path], path);
    return;
  }

  await execFileAsync(
    "cmd.exe",
    ["/C", "code", "--folder-uri", getWslFolderUri(path)],
    path
  );
}

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = (await request.json()) as {
      path?: string;
      target?: VSCodeTarget;
    };

    if (!body.path) {
      return Response.json({ error: "Path is required" }, { status: 400 });
    }

    if (!isVSCodeTarget(body.target)) {
      return Response.json({ error: "Target must be wsl or windows" }, { status: 400 });
    }

    await openInVSCode(body.path, body.target);
    return Response.json({ success: true });
  } catch (error) {
    console.error("Error opening VS Code:", error);
    return Response.json({ error: "Failed to open VS Code" }, { status: 500 });
  }
}