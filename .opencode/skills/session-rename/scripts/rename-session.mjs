#!/usr/bin/env node

const DEFAULT_BASE_URL = process.env.OPENCODE_BASE_URL || "http://127.0.0.1:4097";

function printUsage() {
  console.error(
    "Usage: node .opencode/skills/session-rename/scripts/rename-session.mjs [--session-id <id>] [--base-url <url>] <title>"
  );
}

function parseArgs(argv) {
  const args = [...argv];
  let sessionId = process.env.SESSION_ID || "";
  let baseUrl = DEFAULT_BASE_URL;
  const titleParts = [];

  while (args.length > 0) {
    const current = args.shift();

    if (!current) {
      continue;
    }

    if (current === "--help" || current === "-h") {
      printUsage();
      process.exit(0);
    }

    if (current === "--session-id") {
      const value = args.shift();
      if (!value) {
        throw new Error("Missing value for --session-id");
      }
      sessionId = value;
      continue;
    }

    if (current === "--base-url") {
      const value = args.shift();
      if (!value) {
        throw new Error("Missing value for --base-url");
      }
      baseUrl = value;
      continue;
    }

    titleParts.push(current);
  }

  const title = titleParts.join(" ").trim();

  return {
    sessionId: sessionId.trim(),
    baseUrl: baseUrl.replace(/\/$/, ""),
    title,
  };
}

async function renameSession({ sessionId, baseUrl, title }) {
  if (!sessionId) {
    throw new Error("Missing session id. Pass --session-id or set SESSION_ID.");
  }

  if (!title) {
    throw new Error("Missing title.");
  }

  const url = new URL(`/session/${encodeURIComponent(sessionId)}`, `${baseUrl}/`);
  url.searchParams.set("directory", process.cwd());

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title }),
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const errorMessage = payload?.message || payload?.error || response.statusText;
    throw new Error(`OpenCode session rename failed: ${errorMessage}`);
  }

  const session = payload?.data || payload;

  if (!session || typeof session !== "object") {
    throw new Error("OpenCode session rename returned an unexpected response.");
  }

  const result = {
    id: typeof session.id === "string" ? session.id : sessionId,
    title: typeof session.title === "string" ? session.title : title,
  };

  process.stdout.write(`${JSON.stringify(result)}\n`);
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    await renameSession(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}

await main();