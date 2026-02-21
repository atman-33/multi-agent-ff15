import { existsSync, readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { getProjectRoot } from "@/lib/getProjectRoot.server";

const CRYSTAL_LOG_PATH = "runtime/logs/crystal-messages.jsonl";

export interface CrystalMessageRecord {
  id: string;
  ts: string;
  agent: string;
  content: string;
  recordIndexAtSend: number;
}

/**
 * GET /api/crystal-messages?agent=<noctis|lunafreya>
 * Returns { records: CrystalMessageRecord[] }
 * Reads from runtime/logs/crystal-messages.jsonl
 */
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const url = new URL(request.url);
    const agentFilter = url.searchParams.get("agent");

    const root = getProjectRoot();
    const logPath = join(root, CRYSTAL_LOG_PATH);

    if (!existsSync(logPath)) {
      return Response.json({ records: [] });
    }

    const lines = readFileSync(logPath, "utf-8")
      .split("\n")
      .filter((l) => l.trim() !== "");

    const records: CrystalMessageRecord[] = lines
      .map((line) => {
        try {
          return JSON.parse(line) as CrystalMessageRecord;
        } catch {
          return null;
        }
      })
      .filter((r): r is CrystalMessageRecord => r !== null)
      .filter((r) => !agentFilter || r.agent === agentFilter);

    return Response.json({ records });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

/**
 * POST /api/crystal-messages
 * Body: CrystalMessageRecord (JSON)
 * Appends the record as a new line in the JSONL file.
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  let body: CrystalMessageRecord;
  try {
    body = (await request.json()) as CrystalMessageRecord;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.id || !body.ts || !body.agent || !body.content) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const root = getProjectRoot();
    const logPath = join(root, CRYSTAL_LOG_PATH);
    mkdirSync(dirname(logPath), { recursive: true });
    appendFileSync(logPath, JSON.stringify(body) + "\n", "utf-8");
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
