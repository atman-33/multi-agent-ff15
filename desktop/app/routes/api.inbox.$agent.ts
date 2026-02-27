import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { getProjectRoot } from "@/lib/get-project-root.server";

const ALLOWED_TARGETS = [
  "noctis",
  "lunafreya",
  "ignis",
  "gladiolus",
  "prompto",
  "iris",
  "crystal",
];
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

const WHITESPACE_REGEX = /\s+/;
const MSG_ID_REGEX = /Message\s+(msg_\S+)\s+→/;

interface RawInboxMessage {
  content: string;
  from: string;
  id: string;
  read?: boolean;
  timestamp: string;
  type: string;
}

interface RawInboxFile {
  messages: RawInboxMessage[];
}

/**
 * GET /api/inbox/:agent
 * Returns { messages, count } where messages use `msg_type` (matching the TS interface).
 * Mirrors Tauri `peek_inbox` + `list_inbox_messages`.
 */
export function loader({ params }: LoaderFunctionArgs) {
  const agent = params.agent ?? "";
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
    const countStr = (peekResult.stdout ?? "").split(WHITESPACE_REGEX)[0];
    const count = Number.parseInt(countStr, 10) || 0;

    return Response.json({ messages, count });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

/**
 * POST /api/inbox/:agent  — Send a message via inbox_write.sh
 * PATCH /api/inbox/:agent — Mark message(s) as read
 *   Body: { action: "mark_read", id: "msg_..." }
 *      or { action: "mark_all_read" }
 */
export async function action({ params, request }: ActionFunctionArgs) {
  const agent = params.agent ?? "";
  if (!ALLOWED_TARGETS.includes(agent)) {
    return Response.json({ error: `Invalid agent: ${agent}` }, { status: 400 });
  }

  if (request.method === "PATCH") {
    return handleMarkRead(agent, request);
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
      {
        error: `Invalid sender: ${from}. Allowed: ${ALLOWED_SENDERS.join(", ")}`,
      },
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
    const result = spawnSync(
      "bash",
      [script, agent, from, "message", content],
      {
        cwd: root,
        encoding: "utf-8",
      }
    );

    if (result.status !== 0) {
      return Response.json(
        { error: `inbox_write.sh failed: ${result.stderr}` },
        { status: 500 }
      );
    }

    // Extract message ID from output (✅ Message msg_... → ... inbox)
    const match = (result.stdout || "").match(MSG_ID_REGEX);
    const id = match ? match[1] : undefined;

    return Response.json({ ok: true, id });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

/**
 * PATCH handler: mark individual or all messages as read.
 */
async function handleMarkRead(agent: string, request: Request) {
  let body: { action?: unknown; id?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = String(body.action ?? "");
  if (action !== "mark_read" && action !== "mark_all_read") {
    return Response.json(
      { error: `Invalid action: ${action}. Use "mark_read" or "mark_all_read"` },
      { status: 400 }
    );
  }

  try {
    const root = getProjectRoot();
    const inboxPath = join(root, `queue/inbox/${agent}.yaml`);
    if (!existsSync(inboxPath)) {
      return Response.json({ error: "Inbox not found" }, { status: 404 });
    }

    const yamlContent = readFileSync(inboxPath, "utf-8");
    const parsed = parseYaml(yamlContent) as RawInboxFile | null;
    const messages = parsed?.messages ?? [];

    if (action === "mark_read") {
      const id = String(body.id ?? "");
      if (!id) {
        return Response.json({ error: "Message id is required" }, { status: 400 });
      }
      const msg = messages.find((m) => m.id === id);
      if (!msg) {
        return Response.json({ error: `Message not found: ${id}` }, { status: 404 });
      }
      msg.read = true;
    } else {
      // mark_all_read
      for (const msg of messages) {
        msg.read = true;
      }
    }

    const updated = stringifyYaml({ messages }, { lineWidth: 0 });
    const tmpPath = `${inboxPath}.tmp`;
    writeFileSync(tmpPath, updated, "utf-8");
    renameSync(tmpPath, inboxPath);

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
