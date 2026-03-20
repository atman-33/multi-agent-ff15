import { createOpencodeServer } from "@opencode-ai/sdk/server";

const DEFAULT_URL = "http://127.0.0.1:4097";
const HEALTH_CHECK_URL = `${DEFAULT_URL}/global/health`;

let serverUrl: string | null = null;
let startPromise: Promise<string> | null = null;

async function isServerAlreadyRunning(): Promise<boolean> {
  try {
    const res = await fetch(HEALTH_CHECK_URL, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function doStart(): Promise<string> {
  if (await isServerAlreadyRunning()) {
    return DEFAULT_URL;
  }

  const server = await createOpencodeServer({
    hostname: "127.0.0.1",
    port: 4097,
    timeout: 15_000,
  });

  return server.url;
}

export async function ensureOpencodeServer(): Promise<string> {
  if (serverUrl) return serverUrl;

  if (!startPromise) {
    startPromise = doStart()
      .then((url) => {
        serverUrl = url;
        return url;
      })
      .catch((err) => {
        startPromise = null;
        throw err;
      });
  }

  return startPromise;
}

export function getOpencodeBaseUrl(): string {
  return serverUrl ?? DEFAULT_URL;
}
