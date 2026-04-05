import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CatalogRefreshState } from "@/lib/oh-my-opencode-config";
import { getProjectRoot } from "@/lib/get-project-root.server";
const SOURCE_COMMAND = "opencode models --verbose";

export interface OpencodeModelCatalogSnapshot {
  generatedAt: string;
  models: string[];
  opencodeVersion: string;
  sourceCommand: string;
  variantsByModel: Record<string, string[]>;
}

export interface OpencodeModelCatalogReadResult {
  lastError: string | null;
  refreshState: CatalogRefreshState;
  snapshot: OpencodeModelCatalogSnapshot | null;
  stale: boolean;
}

let hasAttemptedRefresh = false;
let lastError: string | null = null;
let refreshPromise: Promise<OpencodeModelCatalogSnapshot | null> | null = null;

export function getOpencodeModelCatalogPath(root = getProjectRoot()): string {
  return join(root, "runtime", "opencode-model-catalog.json");
}

function execFileWithOutput(
  file: string,
  args: string[],
  options: { cwd: string; encoding: "utf-8"; maxBuffer: number }
): Promise<{ stderr: string; stdout: string }> {
  return new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }

      resolve({ stderr, stdout });
    });
  });
}

function ensureCatalogDirectory(root: string): void {
  mkdirSync(dirname(getOpencodeModelCatalogPath(root)), { recursive: true });
}

function skipWhitespace(input: string, index: number): number {
  let nextIndex = index;
  while (nextIndex < input.length && /\s/.test(input[nextIndex] ?? "")) {
    nextIndex += 1;
  }
  return nextIndex;
}

function readHeaderLine(input: string, index: number): { line: string; nextIndex: number } {
  let nextIndex = index;

  while (nextIndex < input.length && input[nextIndex] !== "\n" && input[nextIndex] !== "\r") {
    nextIndex += 1;
  }

  const line = input.slice(index, nextIndex).trim();

  while (nextIndex < input.length && (input[nextIndex] === "\n" || input[nextIndex] === "\r")) {
    nextIndex += 1;
  }

  return { line, nextIndex };
}

function readJsonObject(input: string, index: number): { json: string; nextIndex: number } {
  let depth = 0;
  let escaped = false;
  let inString = false;

  for (let nextIndex = index; nextIndex < input.length; nextIndex += 1) {
    const character = input[nextIndex];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === "{") {
      depth += 1;
      continue;
    }

    if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return {
          json: input.slice(index, nextIndex + 1),
          nextIndex: nextIndex + 1,
        };
      }
    }
  }

  throw new Error("Failed to parse opencode model metadata: unterminated JSON object");
}

export function parseOpencodeModelsVerboseOutput(stdout: string): Pick<
  OpencodeModelCatalogSnapshot,
  "models" | "variantsByModel"
> {
  const models: string[] = [];
  const variantsByModel: Record<string, string[]> = {};

  let index = 0;
  while (index < stdout.length) {
    index = skipWhitespace(stdout, index);
    if (index >= stdout.length) {
      break;
    }

    const { line, nextIndex } = readHeaderLine(stdout, index);
    if (!line) {
      index = nextIndex;
      continue;
    }

    const jsonStart = skipWhitespace(stdout, nextIndex);
    if (jsonStart >= stdout.length || stdout[jsonStart] !== "{") {
      throw new Error(`Failed to parse opencode model metadata for ${line}`);
    }

    const { json, nextIndex: afterJson } = readJsonObject(stdout, jsonStart);
    const parsed = JSON.parse(json) as { variants?: Record<string, unknown> };

    models.push(line);
    variantsByModel[line] = Object.keys(parsed.variants ?? {});
    index = afterJson;
  }

  return { models, variantsByModel };
}

function readSnapshot(root: string): OpencodeModelCatalogSnapshot | null {
  const filePath = getOpencodeModelCatalogPath(root);
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as OpencodeModelCatalogSnapshot;
  } catch {
    return null;
  }
}

function writeSnapshot(root: string, snapshot: OpencodeModelCatalogSnapshot): void {
  ensureCatalogDirectory(root);
  writeFileSync(getOpencodeModelCatalogPath(root), JSON.stringify(snapshot, null, 2), "utf-8");
}

async function readOpencodeVersion(root: string): Promise<string> {
  try {
    const result = await execFileWithOutput("opencode", ["--version"], {
      cwd: root,
      encoding: "utf-8",
      maxBuffer: 1024 * 1024,
    });

    return result.stdout.trim() || "unknown";
  } catch {
    return "unknown";
  }
}

async function createSnapshot(root: string): Promise<OpencodeModelCatalogSnapshot> {
  const [modelsResult, version] = await Promise.all([
    execFileWithOutput("opencode", ["models", "--verbose"], {
      cwd: root,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    }),
    readOpencodeVersion(root),
  ]);

  const parsed = parseOpencodeModelsVerboseOutput(modelsResult.stdout);

  return {
    generatedAt: new Date().toISOString(),
    models: parsed.models,
    opencodeVersion: version,
    sourceCommand: SOURCE_COMMAND,
    variantsByModel: parsed.variantsByModel,
  };
}

function resolveRefreshState(snapshot: OpencodeModelCatalogSnapshot | null): CatalogRefreshState {
  if (refreshPromise) {
    return "refreshing";
  }

  if (snapshot) {
    return lastError ? "error" : "ready";
  }

  return "unavailable";
}

export function refreshOpencodeModelCatalog(root = getProjectRoot()): Promise<OpencodeModelCatalogSnapshot | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  hasAttemptedRefresh = true;
  refreshPromise = createSnapshot(root)
    .then((snapshot) => {
      writeSnapshot(root, snapshot);
      lastError = null;
      return snapshot;
    })
    .catch((error) => {
      lastError = error instanceof Error ? error.message : String(error);
      throw error;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

export function scheduleOpencodeModelCatalogRefresh(root = getProjectRoot()): void {
  void refreshOpencodeModelCatalog(root).catch((error) => {
    console.error("[opencode-model-catalog] Failed to refresh:", error);
  });
}

export async function readOpencodeModelCatalog(options?: {
  root?: string;
  waitForLatest?: boolean;
}): Promise<OpencodeModelCatalogReadResult> {
  const root = options?.root ?? getProjectRoot();
  const snapshotBeforeRead = readSnapshot(root);

  if (options?.waitForLatest) {
    if (refreshPromise) {
      try {
        await refreshPromise;
      } catch {
        // fall through to the last successful snapshot if available
      }
    } else if (!hasAttemptedRefresh || !snapshotBeforeRead) {
      try {
        await refreshOpencodeModelCatalog(root);
      } catch {
        // fall through to the last successful snapshot if available
      }
    }
  }

  const snapshot = readSnapshot(root);

  return {
    lastError,
    refreshState: resolveRefreshState(snapshot),
    snapshot,
    stale: Boolean(snapshot && lastError),
  };
}

export function resetOpencodeModelCatalogStateForTests(): void {
  hasAttemptedRefresh = false;
  lastError = null;
  refreshPromise = null;
}