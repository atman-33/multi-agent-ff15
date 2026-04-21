import { IrisAuthoringSheet } from "@/components/operation-studio/iris-authoring-sheet";
import type { PromptPart } from "@/lib/prompt-parts";
import type {
  SessionChatRenderSnapshot,
} from "@/lib/session-chat-rendering-orchestration";
import type { SessionStatus } from "@/lib/session-status";
import type { ModelSelection } from "@/lib/types/mission";

export const PROJECT_IRIS_COMPOSER_DRAFT_KEY = "projects:iris:global";
export const PROJECT_IRIS_MANUAL_REFRESH_TEXT =
  "Refresh the Projects page manually after Iris completes a registry change.";
const PROJECT_IRIS_UNAVAILABLE_ERROR = "Pinned project-manage skill is unavailable.";

type ProjectIrisSheetProps = {
  error: string | null;
  isLoading: boolean;
  isOpen: boolean;
  isSending: boolean;
  onClose: () => void;
  onNewSession: () => void;
  onSelectedModelChange: (model: ModelSelection) => void;
  onSend: (parts: PromptPart[]) => Promise<unknown> | undefined;
  renderSnapshot: SessionChatRenderSnapshot | null;
  selectedModel: ModelSelection | null;
  sessionId: string | null;
  sessionStatus: SessionStatus | null;
  skillAvailable: boolean;
  skillError: string | null;
};

export function ProjectIrisSheet({
  error,
  isLoading,
  isOpen,
  isSending,
  onClose,
  onNewSession,
  onSelectedModelChange,
  onSend,
  renderSnapshot,
  selectedModel,
  sessionId,
  sessionStatus,
  skillAvailable,
  skillError,
}: ProjectIrisSheetProps) {
  return (
    <IrisAuthoringSheet
      autoFollowKey={renderSnapshot?.autoFollowKey ?? null}
      composerDraftKey={PROJECT_IRIS_COMPOSER_DRAFT_KEY}
      composerHelperText={skillAvailable ? PROJECT_IRIS_MANUAL_REFRESH_TEXT : (skillError ?? PROJECT_IRIS_UNAVAILABLE_ERROR)}
      composerPlaceholder="Ask Iris to register, rename, refresh, or delete a project"
      conversationSummary={sessionId ? "Restorable single shared conversation" : "Single shared conversation"}
      description="Project management assistant for the registry."
      emptyDescription="Iris can help register, rename, refresh, or delete projects in the registry."
      emptyTitle="Start a Projects conversation."
      error={error}
      isComposerDisabled={!skillAvailable}
      isLoading={isLoading}
      isOpen={isOpen}
      isSending={isSending}
      onClose={onClose}
      onNewSession={onNewSession}
      onSelectedModelChange={onSelectedModelChange}
      onSend={onSend}
      renderedMessages={renderSnapshot?.renderedMessages ?? []}
      scopeLabel="Projects"
      scrollSignal={renderSnapshot?.scrollSignal ?? "none"}
      selectedEntryLabel="project registry"
      selectedModel={selectedModel}
      sessionId={sessionId}
      sessionStatus={sessionStatus}
      streamingMessage={renderSnapshot?.streamingMessage ?? null}
      targetLabel="Project registry operations"
    />
  );
}