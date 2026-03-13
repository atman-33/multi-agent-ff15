import { execFile } from "node:child_process";

type VSCodePreference = "auto" | "wsl" | "windows";

type LaunchStrategy =
  | { type: "wsl"; args: string[] }
  | { type: "windows"; args: string[] };

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

function execFileWithOutput(file: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    execFile(file, args, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(stdout.trim());
    });
  });
}

function isVSCodePreference(value: unknown): value is VSCodePreference {
  return value === "auto" || value === "wsl" || value === "windows";
}

function getWslFolderUri(path: string): string {
  const distro = process.env.WSL_DISTRO_NAME;
  if (!distro) {
    throw new Error("WSL_DISTRO_NAME is not available");
  }

  return `vscode-remote://wsl+${distro}${path}`;
}

function isWindowsMountedPath(path: string): boolean {
  return /^\/mnt\/[a-z]\//i.test(path);
}

async function getWindowsPath(path: string): Promise<string> {
  return execFileWithOutput("wslpath", ["-w", path]);
}

async function resolveLaunchStrategy(
  path: string,
  preference: VSCodePreference
): Promise<LaunchStrategy> {
  if (preference === "wsl") {
    return { type: "wsl", args: [path] };
  }

  if (preference === "auto" && !isWindowsMountedPath(path)) {
    return { type: "wsl", args: [path] };
  }

  if (isWindowsMountedPath(path)) {
    const windowsPath = await getWindowsPath(path);
    return { type: "windows", args: [windowsPath] };
  }

  return {
    type: "windows",
    args: ["--folder-uri", getWslFolderUri(path)],
  };
}

async function openInVSCode(path: string, preference: VSCodePreference) {
  const strategy = await resolveLaunchStrategy(path, preference);

  if (strategy.type === "wsl") {
    await execFileAsync("code", strategy.args, path);
    return;
  }

  await execFileAsync("cmd.exe", ["/C", "code", ...strategy.args], path);
}

export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = (await request.json()) as {
      path?: string;
      preference?: VSCodePreference;
    };

    if (!body.path) {
      return Response.json({ error: "Path is required" }, { status: 400 });
    }

    if (!isVSCodePreference(body.preference)) {
      return Response.json(
        { error: "Preference must be auto, wsl or windows" },
        { status: 400 }
      );
    }

    await openInVSCode(body.path, body.preference);
    return Response.json({ success: true });
  } catch (error) {
    console.error("Error opening VS Code:", error);
    return Response.json({ error: "Failed to open VS Code" }, { status: 500 });
  }
}