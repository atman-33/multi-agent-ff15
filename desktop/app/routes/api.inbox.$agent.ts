import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { parse as parseYaml } from "yaml";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { getProjectRoot } from "@/lib/getProjectRoot.server";

const ALLOWED_TARGETS = ["noctis", "lunafreya"];
const ALLOWED_SENDERS = [
  "crystal",
  "user",
  "noctis",
  "lunafreya",
  "ignis",
  "gladiolus",
  "prompto",
  "iris",
];

interface RawInboxMessage {
  id: string;
  from: string;
  type: string;
  timestamp: string;
  content: string;
  read?: boolean;
}

interface RawInboxFile {
  messages: RawInboxMessage[];
}

/**
 * GET /api/inbox/:agent
 * Returns { messages, count } where messages use `msg_type` (matching the TS interface).
 * Mirrors Tauri `peek_inbox` + `list_inbox_messages`.
 */
export async function loader({ params }: LoaderFunctionArgs) {
  const agent = params["agent"] ?? "";
  if (!ALLOWED_TARGETS.includes(agent)) {
    return Response.json({ error: `Invalid agent: ${agent}` }, { status: 400 });
  }

  try {
    const root = getProjectRoot();

    // Read messages from YAML
    const inboxPath = join(root, `queue/inbox/${agent}.yaml`);
    let messages: ReturnType<typeof normalizeMessage>[] = [];
    if (existsSync(inboxPath)) {
      const yamlContent = readFileSync(inboxPath, "utf-8");
      const parsed = parseYaml(yamlContent) as RawInboxFile;
      messages = (parsed?.messages ?? []).map(normalizeMessage);
    }

    // Peek unread count via script
    const peekResult = spawnSync(
      "bash",
      [join(root, "scripts/inbox_read.sh"), agent, "--peek"],
      { cwd: root, encoding: "utf-8" }
    );
    const countStr = (peekResult.stdout ?? "").split(/\s+/)[0];
    const count = parseInt(countStr, 10) || 0;

    return Response.json({ messages, count });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

/**
 * POST /api/inbox/:agent
 * Body: { from: string, content: string }
 * Sends a message via inbox_write.sh. Mirrors Tauri `send_message`.
 */
export async function action({ params, request }: ActionFunctionArgs) {
  const agent = params["agent"] ?? "";
  if (!ALLOWED_TARGETS.includes(agent)) {
    return Response.json({ error: `Invalid agent: ${agent}` }, { status: 400 });
  }
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  let body: { from?: unknown; content?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const from = String(body.from ?? "");
  const content = String(body.content ?? "").trim();

  if (!ALLOWED_SENDERS.includes(from)) {
    return Response.json(
      { error: `Invalid sender: ${from}. Allowed: ${ALLOWED_SENDERS.join(", ")}` },
      { status: 400 }
    );
  }
  if (!content) {
    return Response.json({ error: "Content cannot be empty" }, { status: 400 });
  }
  if (content.length > 4096) {
    return Response.json(
      { error: "Content exceeds 4096 chars" },
      { status: 400 }
    );
  }

  try {
    const root = getProjectRoot();
    const script = join(root, "scripts/inbox_write.sh");
    const result = spawnSync("bash", [script, agent, from, "message", content], {
      cwd: root,
      encoding: "utf-8",
    });

    if (result.status !== 0) {
      return Response.json(
        { error: `inbox_write.sh failed: ${result.stderr}` },
        { status: 500 }
      );
    }
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

// Normalize YAML field `type` → `msg_type` to match the TypeScript interface
function normalizeMessage(m: RawInboxMessage) {
  return {
    id: m.id,
    from: m.from,
    msg_type: m.type,
    timestamp: m.timestamp,
    content: m.content,
    read: m.read ?? false,
  };
}
