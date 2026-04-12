import type { ActivityActorId } from "@/lib/types/mission";

const STRUCTURED_WORKFLOW_TAG_REGEX =
  /<(operation-prompt|user-request|task|team-message|worker-report|worker-report-details)\b/i;

const OPERATION_PROMPT_BODY_REGEX =
  /<operation-prompt\b[^>]*>([\s\S]*?)<\/operation-prompt>/i;

const TOP_LEVEL_SECTION_REGEX = /<([a-z][a-z0-9-]*)\b([^>]*)>([\s\S]*?)<\/\1>/gi;

const PROMPT_CONTEXT_SECTION_LABELS: Record<string, string> = {
  "analyze-mode": "Analyze Mode",
  "delegation-context": "Delegation Context",
  job: "Job",
  "knowledge-catalog": "Knowledge Catalog",
  instruction: "Instruction",
  "delegation-guidance": "Delegation Guidance",
  "workspace-context": "Workspace Context",
  "tooling-context": "Tooling Context",
  handoff: "Handoff",
  task: "Task",
  policy: "Policy",
  "output-contract": "Output Contract",
  "step-completion-contract": "Step Completion Contract",
  "step-transition": "Step Transition",
  "next-action": "Next Action",
  "operation-note": "Operation Note",
  "operation-terminal-status": "Operation Terminal Status",
  "deviation-note": "Deviation Note",
  "team-message": "Team Message",
};

const INJECTED_PROMPT_CONTEXT_TAG_NAMES = new Set([
  "workspace-context",
  "tooling-context",
  "delegation-context",
]);

const VISIBLE_BODY_TAG_NAMES = new Set(["user-request", "task", "team-message", "worker-report"]);
const NON_WORKFLOW_SECTION_TAG_NAMES = new Set([
  "user-request",
  "task",
  "team-message",
  "worker-report",
  "worker-report-details",
]);

type WorkflowSectionAttributes = {
  from: ActivityActorId | null;
  to: ActivityActorId | null;
};

export type PromptContextSource = "workflow" | "injected";

export interface PromptContextSection {
  key: string;
  tagName: string;
  label: string;
  content: string;
  preview: string;
  source: PromptContextSource;
  detailId?: string;
  sourceMessageId?: string;
}

export interface WorkflowMessagePresentation {
  visibleBody: string;
  visibleBodyFrom: ActivityActorId | null;
  visibleBodyTo: ActivityActorId | null;
  reportDetails: string | null;
  promptContextSections: PromptContextSection[];
  rawPrompt: string | null;
  usedFallback: boolean;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripXmlTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ");
}

function buildSectionPreview(value: string): string {
  const collapsed = collapseWhitespace(stripXmlTags(value));
  if (collapsed.length <= 140) {
    return collapsed;
  }

  return `${collapsed.slice(0, 137)}...`;
}

function toSectionLabel(tagName: string): string {
  const knownLabel = PROMPT_CONTEXT_SECTION_LABELS[tagName];
  if (knownLabel) {
    return knownLabel;
  }

  return tagName
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function toPromptContextSection(
  section: {
    tagName: string;
    content: string;
  },
  index: number,
  source: PromptContextSource,
): PromptContextSection {
  return {
    key: `${section.tagName}:${index}`,
    tagName: section.tagName,
    label: toSectionLabel(section.tagName),
    content: section.content,
    preview: buildSectionPreview(section.content),
    source,
  };
}

export function getPromptContextSourceLabel(source: PromptContextSource): string {
  return source === "workflow" ? "Workflow" : "Injected";
}

export function parseInjectedPromptContextSections(rawText: string): PromptContextSection[] {
  const normalizedRawText = rawText.trim();
  if (!normalizedRawText) {
    return [];
  }

  return extractTopLevelSections(normalizedRawText)
    .filter((section) => INJECTED_PROMPT_CONTEXT_TAG_NAMES.has(section.tagName))
    .map((section, index) => toPromptContextSection(section, index, "injected"));
}

function decodeXmlAttribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function normalizeActorId(value: string | null | undefined): ActivityActorId | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (
    normalized === "user" ||
    normalized === "noctis" ||
    normalized === "lunafreya" ||
    normalized === "ignis" ||
    normalized === "gladiolus" ||
    normalized === "prompto" ||
    normalized === "iris" ||
    normalized === "system"
  ) {
    return normalized;
  }

  if (normalized === "gladio") {
    return "gladiolus";
  }

  return null;
}

function parseXmlAttributes(rawAttributes: string): WorkflowSectionAttributes {
  const parsed: Record<string, string> = {};

  for (const match of rawAttributes.matchAll(/([a-z][a-z0-9-]*)\s*=\s*"([^"]*)"/gi)) {
    const key = match[1]?.trim().toLowerCase() ?? "";
    const value = match[2] ? decodeXmlAttribute(match[2]) : "";
    if (!key) {
      continue;
    }
    parsed[key] = value;
  }

  return {
    from: normalizeActorId(parsed.from),
    to: normalizeActorId(parsed.to),
  };
}

function extractOperationPromptBody(document: string): string | null {
  return document.match(OPERATION_PROMPT_BODY_REGEX)?.[1]?.trim() ?? null;
}

function extractXmlSectionBody(document: string, tagName: string): string | null {
  const match = document.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  const content = match?.[1]?.trim() ?? "";
  return content.length > 0 ? content : null;
}

function extractTopLevelSections(document: string): Array<{
  tagName: string;
  content: string;
  attributes: WorkflowSectionAttributes;
}> {
  const sections: Array<{
    tagName: string;
    content: string;
    attributes: WorkflowSectionAttributes;
  }> = [];

  for (const match of document.matchAll(TOP_LEVEL_SECTION_REGEX)) {
    const tagName = match[1]?.trim().toLowerCase() ?? "";
    const attributes = parseXmlAttributes(match[2] ?? "");
    const content = match[3]?.trim() ?? "";
    if (!tagName || !content) {
      continue;
    }

    sections.push({ tagName, content, attributes });
  }

  return sections;
}

function prioritizeNormalizedLunafreyaSections(input: {
  sections: Array<{
    tagName: string;
    content: string;
    attributes: WorkflowSectionAttributes;
  }>;
  visibleSection?: {
    tagName: string;
    content: string;
    attributes: WorkflowSectionAttributes;
  };
}): Array<{
  tagName: string;
  content: string;
  attributes: WorkflowSectionAttributes;
}> {
  const talksToOrFromLunafreya =
    input.visibleSection?.attributes.to === "lunafreya" ||
    input.visibleSection?.attributes.from === "lunafreya";
  const hasJob = input.sections.some((section) => section.tagName === "job");
  const hasInstruction = input.sections.some((section) => section.tagName === "instruction");
  const hasLegacyOverlayTags = input.sections.some(
    (section) =>
      section.tagName === "lunafreya-overlays" || section.tagName === "lunafreya-job-overlay",
  );

  if (!talksToOrFromLunafreya || !hasJob || hasInstruction || hasLegacyOverlayTags) {
    return input.sections;
  }

  const prioritized: typeof input.sections = [];

  for (const section of input.sections) {
    if (section.tagName === "job") {
      prioritized.push(section);
    }
  }

  for (const section of input.sections) {
    if (section.tagName === "knowledge-catalog") {
      prioritized.push(section);
    }
  }

  for (const section of input.sections) {
    if (section.tagName === "job" || section.tagName === "knowledge-catalog") {
      continue;
    }

    prioritized.push(section);
  }

  return prioritized;
}

export function parseWorkflowMessagePresentation(rawText: string): WorkflowMessagePresentation | null {
  const normalizedRawText = rawText.trim();
  if (!normalizedRawText) {
    return null;
  }

  if (!STRUCTURED_WORKFLOW_TAG_REGEX.test(normalizedRawText)) {
    return null;
  }

  const operationPromptBody = extractOperationPromptBody(normalizedRawText);
  const sectionSource = operationPromptBody ?? normalizedRawText;
  const topLevelSections = extractTopLevelSections(sectionSource);
  const visibleSection = topLevelSections.find((section) => VISIBLE_BODY_TAG_NAMES.has(section.tagName));
  const visibleBody =
    visibleSection?.content ??
    extractXmlSectionBody(sectionSource, "user-request") ??
    extractXmlSectionBody(sectionSource, "task") ??
    extractXmlSectionBody(sectionSource, "team-message") ??
    extractXmlSectionBody(sectionSource, "worker-report");

  if (!visibleBody) {
    return {
      visibleBody: normalizedRawText,
      visibleBodyFrom: null,
      visibleBodyTo: null,
      reportDetails: null,
      promptContextSections: [],
      rawPrompt: normalizedRawText,
      usedFallback: true,
    };
  }

  const promptContextSections = prioritizeNormalizedLunafreyaSections({
    sections: topLevelSections,
    visibleSection,
  })
    .filter((section) => !NON_WORKFLOW_SECTION_TAG_NAMES.has(section.tagName))
    .map((section, index) => toPromptContextSection(section, index, "workflow"));

  return {
    visibleBody,
    visibleBodyFrom: visibleSection?.attributes.from ?? null,
    visibleBodyTo: visibleSection?.attributes.to ?? null,
    reportDetails:
      topLevelSections.find((section) => section.tagName === "worker-report-details")?.content ??
      extractXmlSectionBody(sectionSource, "worker-report-details"),
    promptContextSections,
    rawPrompt: normalizedRawText,
    usedFallback: false,
  };
}