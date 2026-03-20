import { execFile } from "node:child_process";
import type { Route } from "./+types/api.session.$id.open-terminal";
import { getOpencodeClient } from "@/lib/opencode-client";

type SessionSummary = {
  id: string;
  directory?: string;
};

function execFileAsync(file: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    execFile(file, args, (error) => {
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

function quoteForBash(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function quoteForPowerShell(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function hasWindowsTerminal(): Promise<boolean> {
  try {
    await execFileWithOutput("cmd.exe", ["/C", "where", "wt.exe"]);
    return true;
  } catch {
    return false;
  }
}

async function resolveOpencodePath(): Promise<string> {
  const resolved = await execFileWithOutput("bash", ["-lc", "command -v opencode"]);
  if (!resolved) {
    throw new Error("opencode command was not found in the server environment");
  }

  return resolved;
}

async function openSessionTerminal(sessionId: string, directory: string) {
  const distro = process.env.WSL_DISTRO_NAME;
  if (!distro) {
    throw new Error("WSL_DISTRO_NAME is not available");
  }

  const opencodePath = await resolveOpencodePath();
  const resumeCommand = `cd ${quoteForBash(directory)} && ${quoteForBash(opencodePath)} -s ${quoteForBash(sessionId)}`;

  const launchInPowerShell = async (filePath: string, args: string[]) => {
    const encodedArgumentList = args.map((arg) => quoteForPowerShell(arg)).join(", ");
    const script = `Start-Process -FilePath ${quoteForPowerShell(filePath)} -ArgumentList @(${encodedArgumentList})`;
    await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script]);
  };

  if (await hasWindowsTerminal()) {
    await launchInPowerShell("wt.exe", [
      "wsl.exe",
      "-d",
      distro,
      "bash",
      "-ic",
      resumeCommand,
    ]);
    return;
  }

  await launchInPowerShell("wsl.exe", ["-d", distro, "bash", "-ic", resumeCommand]);
}

export const action = async ({ params }: Route.ActionArgs) => {
  const sessionId = params.id;
  if (!sessionId) {
    return Response.json({ error: "Missing session id" }, { status: 400 });
  }

  try {
    const client = getOpencodeClient();
    const result = await client.session.list();

    if (result.error) {
      return Response.json({ error: result.error }, { status: 502 });
    }

    const session = (result.data as SessionSummary[] | undefined)?.find((entry) => entry.id === sessionId);
    if (!session?.directory) {
      return Response.json({ error: "Session directory not found" }, { status: 404 });
    }

    await openSessionTerminal(sessionId, session.directory);

    return Response.json({ ok: true });
  } catch (error) {
    console.error("[OpenSessionTerminal] Error:", error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to open terminal",
      },
      { status: 500 }
    );
  }
};