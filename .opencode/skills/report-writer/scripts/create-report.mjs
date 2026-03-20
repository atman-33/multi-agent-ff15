#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../../..");
const settingsPath = path.join(repoRoot, "config", "settings.yaml");
const reportsDir = path.join(repoRoot, "docs", "reports");

function parseArgs(argv) {
  const options = {
    title: "",
    slug: "",
    author: "github-copilot",
    tags: [],
    language: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--title") {
      options.title = argv[index + 1] || "";
      index += 1;
      continue;
    }

    if (arg === "--slug") {
      options.slug = argv[index + 1] || "";
      index += 1;
      continue;
    }

    if (arg === "--author") {
      options.author = argv[index + 1] || options.author;
      index += 1;
      continue;
    }

    if (arg === "--tags") {
      options.tags = (argv[index + 1] || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }

    if (arg === "--language") {
      options.language = (argv[index + 1] || "").trim();
      index += 1;
      continue;
    }
  }

  if (!options.title.trim()) {
    throw new Error("Missing required argument --title");
  }

  return options;
}

function readDefaultLanguage() {
  const source = readFileSync(settingsPath, "utf8");
  const match = source.match(/^language:\s*([^\s#]+)\s*$/m);
  return match?.[1]?.trim() || "en";
}

function createDateParts() {
  const now = new Date();
  const iso = now.toISOString();
  const suffix = iso.slice(0, 10).replace(/-/g, "");
  return { iso, suffix };
}

function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function quote(value) {
  return JSON.stringify(value);
}

function renderTags(tags) {
  if (tags.length === 0) {
    return "[]";
  }

  return `[${tags.map((tag) => JSON.stringify(tag)).join(", ")}]`;
}

function renderTemplate(title, language) {
  if (language === "ja") {
    return `# ${title}\n\n## Scope\n\n## Summary\n\n## Details\n\n## Follow-up\n`;
  }

  return `# ${title}\n\n## Scope\n\n## Summary\n\n## Details\n\n## Follow-up\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const { iso, suffix } = createDateParts();
  const language = options.language || readDefaultLanguage();
  const baseSlug = options.slug || slugify(options.title);
  const slug = baseSlug || `report-${suffix}`;
  const fileName = `${slug}-${suffix}.md`;
  const absolutePath = path.join(reportsDir, fileName);
  const relativePath = path.relative(repoRoot, absolutePath);

  mkdirSync(reportsDir, { recursive: true });

  const frontmatter = [
    "---",
    `title: ${quote(options.title)}`,
    `author: ${quote(options.author)}`,
    `date: ${quote(iso)}`,
    `tags: ${renderTags(options.tags)}`,
    `language: ${quote(language)}`,
    "---",
    "",
  ].join("\n");

  const body = renderTemplate(options.title, language);

  writeFileSync(absolutePath, `${frontmatter}${body}`, {
    encoding: "utf8",
    flag: "wx",
  });

  process.stdout.write(
    `${JSON.stringify({ path: relativePath, absolutePath, language, title: options.title })}\n`
  );
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}