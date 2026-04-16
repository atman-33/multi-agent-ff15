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

export function buildOperationStudioIrisContextText(
  input: OperationStudioIrisContextInput,
): string {
  const lines = [
    "<operation_studio_context>",
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
  lines.push("</operation_studio_context>");
  lines.push("");
  lines.push(
    "Use this as the current Operation Studio context when you suggest revisions or explain the selected operation.",
  );

  return lines.join("\n");
}

export function prependOperationStudioIrisContext(
  context: OperationStudioIrisContextInput,
  parts: PromptPart[],
): PromptPart[] {
  return [
    {
      type: "text",
      text: buildOperationStudioIrisContextText(context),
    },
    ...parts,
  ];
}