import { removeInternalContext } from "@/lib/chat-internal-context";
import {
  parseInjectedPromptContextSections,
  parseWorkflowMessagePresentation,
  type PromptContextSection,
  type PromptContextSource,
  type WorkflowMessagePresentation,
} from "@/lib/chat-workflow-presentation";
import { getActivityActorLabel } from "@/lib/team-message-format";

export type SessionMessageDisplay = {
  displayContent: string;
  promptContextSections: PromptContextSection[];
  promptContextSource: PromptContextSource | null;
  rawWorkflowPrompt: string | null;
  reportDetails: string | null;
  resolvedSenderIsUser: boolean;
  resolvedSenderLabel: string;
  workflowPresentation: WorkflowMessagePresentation | null;
};

export function resolveSessionMessageDisplay(input: {
  rawText: string;
  fallbackRole: "user" | "assistant";
  fallbackSenderLabel: string;
}): SessionMessageDisplay {
  const workflowPresentation = parseWorkflowMessagePresentation(input.rawText);
  const hasStructuredWorkflow = Boolean(workflowPresentation && !workflowPresentation.usedFallback);
  const workflowSender = workflowPresentation?.visibleBodyFrom ?? null;
  const promptContextSections = hasStructuredWorkflow
    ? workflowPresentation?.promptContextSections ?? []
    : parseInjectedPromptContextSections(input.rawText);

  return {
    displayContent: workflowPresentation
      ? workflowPresentation.visibleBody
      : removeInternalContext(input.rawText).trim(),
    promptContextSections,
    promptContextSource: hasStructuredWorkflow
      ? "workflow"
      : promptContextSections.length > 0
        ? "injected"
        : null,
    rawWorkflowPrompt: hasStructuredWorkflow ? workflowPresentation?.rawPrompt ?? null : null,
    reportDetails: hasStructuredWorkflow ? workflowPresentation?.reportDetails ?? null : null,
    resolvedSenderIsUser: workflowSender ? workflowSender === "user" : input.fallbackRole === "user",
    resolvedSenderLabel: workflowSender
      ? getActivityActorLabel(workflowSender)
      : input.fallbackSenderLabel,
    workflowPresentation,
  };
}