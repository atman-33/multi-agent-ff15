import { buildTextSection } from "@/lib/prompt-composition-engine/prompt-xml";
import type { PromptPart } from "@/lib/prompt-parts";

interface OperationStudioIrisContextInput {
  draftPreviewPartySummary?: string | null;
  lunafreyaJobLabel?: string | null;
  lunafreyaSkillLabels?: string[];
  scopeLabel: string;
  selectedEntryDescription?: string | null;
  selectedEntryLabel: string;
  selectedNodeBadge?: string | null;
  selectedStepNumber?: number | null;
  selectedStepTitle?: string | null;
  targetLabel: string;
  taskInstruction?: string | null;
  userMessage?: string | null;
}

function appendContextLine(lines: string[], label: string, value: string | null | undefined): void {
  const normalized = value?.trim();
  if (!normalized) {
    return;
  }

  lines.push(`${label}: ${normalized}`);
}

function buildOperationStudioIrisUserRequestText(parts: PromptPart[]): string | null {
  const text = parts
    .filter((part): part is Extract<PromptPart, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();

  if (!text) {
    return null;
  }

  return buildTextSection("user-request", text, {
    from: "user",
    to: "iris",
  });
}

export function buildOperationStudioIrisContextText(
  input: OperationStudioIrisContextInput,
): string {
  const lines = [
    "<operation-studio-context>",
    `scope: ${input.scopeLabel}`,
    `authoring_target: ${input.targetLabel}`,
    `selected_entry: ${input.selectedEntryLabel}`,
  ];

  appendContextLine(lines, "selected_entry_description", input.selectedEntryDescription ?? null);

  if (input.selectedStepTitle?.trim()) {
    const stepPrefix = input.selectedStepNumber ? `Step ${input.selectedStepNumber} · ` : "";
    appendContextLine(lines, "selected_preview_step", `${stepPrefix}${input.selectedStepTitle}`);
  }

  appendContextLine(lines, "selected_preview_node", input.selectedNodeBadge ?? null);
  appendContextLine(lines, "preview_party", input.draftPreviewPartySummary ?? null);
  appendContextLine(lines, "lunafreya_job", input.lunafreyaJobLabel ?? null);
  appendContextLine(
    lines,
    "lunafreya_skills",
    input.lunafreyaSkillLabels?.length ? input.lunafreyaSkillLabels.join(", ") : null,
  );
  appendContextLine(lines, "user_message_seed", input.userMessage ?? null);
  appendContextLine(lines, "worker_task_seed", input.taskInstruction ?? null);
  lines.push("</operation-studio-context>");

  return lines.join("\n");
}

export function prependOperationStudioIrisContext(
  context: OperationStudioIrisContextInput,
  parts: PromptPart[],
  pinnedSkillPromptContext: string | null = null,
): PromptPart[] {
  const userRequestText = buildOperationStudioIrisUserRequestText(parts);
  const promptParts: PromptPart[] = [];
  let userRequestInserted = false;

  for (const part of parts) {
    if (part.type !== "text") {
      promptParts.push(part);
      continue;
    }

    if (!userRequestText || userRequestInserted) {
      continue;
    }

    promptParts.push({
      type: "text",
      text: userRequestText,
    });
    userRequestInserted = true;
  }

  if (userRequestText && !userRequestInserted) {
    promptParts.push({
      type: "text",
      text: userRequestText,
    });
  }

  return [
    {
      type: "text",
      text: buildOperationStudioIrisContextText(context),
    },
    ...(pinnedSkillPromptContext
      ? [
          {
            type: "text" as const,
            text: pinnedSkillPromptContext,
          },
        ]
      : []),
    ...promptParts,
  ];
}