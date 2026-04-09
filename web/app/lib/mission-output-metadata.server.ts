import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { parseMarkdownDocument } from "@/lib/markdown-document.server";
import { getMissionOutputFilePath, getMissionOutputsDir } from "@/lib/mission-store";
import type { MissionOutputDocument, MissionOutputSummary } from "@/lib/types/mission";

const MARKDOWN_EXTENSION_REGEX = /\.md$/i;
const SAFE_OUTPUT_SEGMENT_REGEX = /^[a-zA-Z0-9_.-]+$/;

function sanitizeOutputSegment(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed || !SAFE_OUTPUT_SEGMENT_REGEX.test(trimmed)) {
    throw new Error(`Invalid ${label}`);
  }
  return trimmed;
}

function parseMissionOutputDocument(input: {
  filePath: string;
  step: string;
  taskId: string;
  filename: string;
}): MissionOutputDocument {
  const rawContent = readFileSync(input.filePath, "utf-8");
  const stats = statSync(input.filePath);
  const parsed = parseMarkdownDocument(rawContent, {
    defaultMetadata: {
      title: input.filename.replace(MARKDOWN_EXTENSION_REGEX, ""),
      author: "",
      date: stats.mtime.toISOString(),
      tags: [],
    },
  });

  return {
    step: input.step,
    taskId: input.taskId,
    filename: input.filename,
    title: parsed.metadata.title,
    author: parsed.metadata.author,
    date: parsed.metadata.date,
    filePath: input.filePath,
    tags: parsed.metadata.tags,
    content: parsed.content,
    displayMode: parsed.displayMode,
    frontmatter: parsed.frontmatter,
    rawContent: parsed.rawContent,
  };
}

export function listMissionOutputs(missionId: string): MissionOutputSummary[] {
  const outputsDir = getMissionOutputsDir(missionId);
  if (!existsSync(outputsDir)) {
    return [];
  }

  const outputs: MissionOutputSummary[] = [];

  for (const stepEntry of readdirSync(outputsDir, { withFileTypes: true })) {
    if (!stepEntry.isDirectory()) {
      continue;
    }

    const stepDir = `${outputsDir}/${stepEntry.name}`;
    for (const taskEntry of readdirSync(stepDir, { withFileTypes: true })) {
      if (!taskEntry.isDirectory()) {
        continue;
      }

      const taskDir = `${stepDir}/${taskEntry.name}`;
      for (const fileEntry of readdirSync(taskDir, { withFileTypes: true })) {
        if (!fileEntry.isFile()) {
          continue;
        }

        const document = parseMissionOutputDocument({
          filePath: `${taskDir}/${fileEntry.name}`,
          step: stepEntry.name,
          taskId: taskEntry.name,
          filename: fileEntry.name,
        });
        outputs.push({
          step: document.step,
          taskId: document.taskId,
          filename: document.filename,
          title: document.title,
          author: document.author,
          date: document.date,
          filePath: document.filePath,
          tags: document.tags,
        });
      }
    }
  }

  outputs.sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());

  return outputs;
}

export function readMissionOutputDocument(input: {
  missionId: string;
  step: string;
  taskId: string;
  filename: string;
}): MissionOutputDocument | null {
  const step = sanitizeOutputSegment(input.step, "step");
  const taskId = sanitizeOutputSegment(input.taskId, "taskId");
  const filename = sanitizeOutputSegment(input.filename, "filename");
  const filePath = getMissionOutputFilePath(input.missionId, step, taskId, filename);

  if (!existsSync(filePath)) {
    return null;
  }

  return parseMissionOutputDocument({
    filePath,
    step,
    taskId,
    filename,
  });
}