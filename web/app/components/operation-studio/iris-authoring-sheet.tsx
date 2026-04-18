import { Cpu } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CompactModelVariantPicker } from "@/components/compact-model-variant-picker";
import { PromptComposer } from "@/components/chat/prompt-composer";
import { SessionMessageList } from "@/components/chat/session-message-list";
import { ChatThreadFrame } from "@/components/chat/thread-frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConversationUnitInspectability } from "@/hooks/use-conversation-unit-inspectability";
import { buildMessageInspectabilityBoundary } from "@/lib/message-inspectability-state";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getAgentTheme } from "@/lib/agent-theme";
import {
  flattenProviderModels,
  type ModelCatalogItem,
  type OpencodeProvider,
  type OpencodeProvidersResponse,
} from "@/lib/opencode-provider-catalog";
import type {
  SessionChatScrollSignal,
} from "@/lib/session-chat-rendering-orchestration";
import type { RenderedSessionMessage } from "@/lib/session-message-presentation";
import { isSessionStatusActive, type SessionStatus } from "@/lib/session-status";
import type { PromptPart } from "@/lib/prompt-parts";
import type { ModelSelection } from "@/lib/types/mission";
import { cn } from "@/lib/utils";
import { IrisMessageDetailSheet } from "./iris-message-detail-sheet";

const IRIS_PORTRAIT_SRC = "/images/iris.png";

interface IrisAuthoringSheetProps {
  autoFollowKey: string | null;
  composerDraftKey: string;
  conversationSummary: string;
  error?: string | null;
  isLoading: boolean;
  isOpen: boolean;
  isSending: boolean;
  onClose: () => void;
  onNewSession: () => void;
  onSend: (parts: PromptPart[]) => Promise<unknown> | undefined;
  onSelectedModelChange: (model: ModelSelection) => void;
  renderedMessages: RenderedSessionMessage[];
  scopeLabel: string;
  scrollSignal: SessionChatScrollSignal;
  selectedModel: ModelSelection | null;
  selectedEntryLabel: string;
  sessionId: string | null;
  sessionStatus: SessionStatus | null;
  streamingMessage: RenderedSessionMessage | null;
  targetLabel: string;
}

function buildStatusLabel(input: {
  isLoading: boolean;
  isSending: boolean;
  sessionId: string | null;
  sessionStatus: SessionStatus | null;
}): string {
  if (input.isLoading || input.isSending || isSessionStatusActive(input.sessionStatus)) {
    return "Thinking";
  }

  if (input.sessionId) {
    return "Attached";
  }

  return "New Session";
}

function IrisPortrait({ size }: { size: "header" | "empty" | "message" }) {
  const theme = getAgentTheme("iris");
  const isMessagePortrait = size === "message";
  const frameSizeClass = size === "empty"
    ? "h-20 w-20"
    : isMessagePortrait
      ? "h-8 w-8"
      : "h-14 w-14";
  const glowSizeClass = size === "empty"
    ? "h-14 w-14 blur-2xl"
    : "h-10 w-10 blur-xl";
  const frameShadow = size === "empty"
    ? `0 0 26px ${theme?.glowSoft ?? "rgba(56, 189, 248, 0.2)"}`
    : `0 0 18px ${theme?.glowSoft ?? "rgba(56, 189, 248, 0.2)"}`;
  const imageGlowFilter = [
    `drop-shadow(0 0 3px ${theme?.ring ?? "rgba(125, 211, 252, 0.68)"})`,
    `drop-shadow(0 0 6px ${theme?.glow ?? "rgba(56, 189, 248, 0.3)"})`,
  ].join(" ");

  return (
    <div className={`relative flex shrink-0 items-center justify-center ${frameSizeClass}`}>
      {isMessagePortrait ? null : (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute rounded-full ${glowSizeClass}`}
          style={{
            background: theme
              ? `radial-gradient(circle, ${theme.glow} 0%, ${theme.glowSoft} 68%, rgba(0,0,0,0) 100%)`
              : "radial-gradient(circle, rgba(56,189,248,0.3) 0%, rgba(56,189,248,0.18) 68%, rgba(0,0,0,0) 100%)",
          }}
        />
      )}
      <div
        className={`relative z-10 flex ${frameSizeClass} items-center justify-center rounded-full border p-1 ring-1 ring-white/6`}
        style={{
          borderColor: theme?.ring ?? "rgba(125, 211, 252, 0.68)",
          background: theme?.portraitBg ?? "rgba(13, 24, 34, 0.96)",
          boxShadow: isMessagePortrait ? undefined : frameShadow,
        }}
      >
        <img
          alt="Iris portrait"
          className="h-full w-full rounded-full object-cover"
          src={IRIS_PORTRAIT_SRC}
          style={{ filter: imageGlowFilter }}
        />
      </div>
    </div>
  );
}

export function resolveSheetPortalContainer(
  currentContainer: HTMLDivElement | null,
  nextContainer: HTMLDivElement | null,
): HTMLDivElement | null {
  return currentContainer === nextContainer ? currentContainer : nextContainer;
}

function IrisPendingBubble() {
  return (
    <div className="flex items-end gap-2">
      <IrisPortrait size="message" />
      <div className="rounded-2xl rounded-bl-sm border border-border/50 bg-card px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60" />
        </div>
      </div>
    </div>
  );
}

export function IrisAuthoringSheet({
  autoFollowKey,
  composerDraftKey,
  conversationSummary,
  error = null,
  isLoading,
  isOpen,
  isSending,
  onClose,
  onNewSession,
  onSend,
  onSelectedModelChange,
  renderedMessages,
  scopeLabel,
  scrollSignal,
  selectedModel,
  selectedEntryLabel,
  sessionId,
  sessionStatus,
  streamingMessage,
  targetLabel,
}: IrisAuthoringSheetProps) {
  const [sheetContentElement, setSheetContentElement] = useState<HTMLDivElement | null>(null);
  const [providers, setProviders] = useState<OpencodeProvider[]>([]);
  const [variantsByModel, setVariantsByModel] = useState<Record<string, string[]>>({});
  const statusLabel = buildStatusLabel({
    isLoading,
    isSending,
    sessionId,
    sessionStatus,
  });
  const modelItems = useMemo<ModelCatalogItem[]>(() => flattenProviderModels(providers), [providers]);
  const inspectability = useConversationUnitInspectability(
    useMemo(
      () => renderedMessages.map((message) => buildMessageInspectabilityBoundary(message)),
      [renderedMessages],
    ),
  );
  const isSessionActive = isSessionStatusActive(sessionStatus);
  const renderIrisAvatar = useCallback(
    (message: RenderedSessionMessage) =>
      message.messageDisplay.resolvedSenderIsUser ? null : <IrisPortrait size="message" />,
    [],
  );
  const renderIrisDetailSheet = useCallback(
    ({
      message,
      onOpenChange,
      open,
    }: {
      message: RenderedSessionMessage;
      open: boolean;
      onOpenChange: (open: boolean) => void;
    }) => (
      <IrisMessageDetailSheet message={message} onOpenChange={onOpenChange} open={open} />
    ),
    [],
  );
  const handleSheetContentRef = useCallback((node: HTMLDivElement | null) => {
    setSheetContentElement((current) => resolveSheetPortalContainer(current, node));
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadProviders = async () => {
      const response = await fetch("/api/providers").catch(() => null);
      if (!response?.ok || !isMounted) {
        return;
      }

      const data = (await response.json()) as OpencodeProvidersResponse;
      if (!isMounted) {
        return;
      }

      setProviders(data.providers ?? []);
      setVariantsByModel(data.variantsByModel ?? {});
    };

    void loadProviders();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <Sheet onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
    }} open={isOpen}>
      <SheetContent className="flex h-full flex-col gap-0 overflow-hidden border-slate-800/70 bg-slate-950/92 p-0 text-slate-100 backdrop-blur-xl sm:max-w-2xl" ref={handleSheetContentRef} side="right">
        <SheetHeader className="border-slate-800/70 border-b bg-white/2 px-5 py-4 text-left">
          <div className="flex flex-wrap items-start justify-between gap-4 pr-12">
            <div className="flex min-w-0 items-start gap-3">
              <IrisPortrait size="header" />
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <SheetTitle className="text-slate-50">Iris</SheetTitle>
                  <Badge variant="outline">{statusLabel}</Badge>
                  <Badge variant="outline">{scopeLabel}</Badge>
                </div>
                <SheetDescription className="text-slate-400">
                  Studio-scoped authoring assistant for {selectedEntryLabel}.
                </SheetDescription>
                <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                  <span>{targetLabel}</span>
                  <span className="text-slate-600">•</span>
                  <span>{conversationSummary}</span>
                </div>
              </div>
            </div>

            <div className="shrink-0 self-start">
              <Button onClick={onNewSession} size="sm" type="button" variant="outline">
                New Session
              </Button>
            </div>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1">
          <ChatThreadFrame
            autoFollowKey={autoFollowKey}
            contentClassName="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-3 overflow-x-hidden px-1"
            footer={
              <div className="border-slate-800/70 border-t bg-slate-950/90 px-4 py-3">
                <PromptComposer
                  disabled={isLoading || isSending || isSessionStatusActive(sessionStatus)}
                  draftKey={composerDraftKey}
                  footerEnd={
                    <CompactModelVariantPicker
                      ariaLabel="Select model for iris"
                      contentAlign="start"
                      contentSide="top"
                      emptyLabel="Model"
                      modelItems={modelItems}
                      onSelect={onSelectedModelChange}
                      portalContainer={sheetContentElement}
                      selectedModel={selectedModel}
                      triggerClassName={cn(
                        "h-8 w-full px-2 text-xs sm:w-72",
                        selectedModel ? "text-foreground" : "text-muted-foreground"
                      )}
                      triggerIcon={<Cpu className="h-3.5 w-3.5 shrink-0" />}
                      variantsByModel={variantsByModel}
                    />
                  }
                  onSend={(parts) => onSend(parts)}
                  placeholder="Ask Iris to revise the selected operation"
                />
              </div>
            }
            header={
              error ? (
                <div className="border-b border-red-700/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {error}
                </div>
              ) : undefined
            }
            outerClassName="flex h-full min-h-0 min-w-0 flex-col"
            resetKey={sessionId}
            scrollSignal={scrollSignal}
          >
            {() =>
              renderedMessages.length === 0 && !streamingMessage && !isSessionActive ? (
                <div className="flex min-h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center text-slate-400">
                  <IrisPortrait size="empty" />
                  <div className="space-y-1">
                    <p className="font-medium text-slate-200 text-sm">Start a Studio-scoped conversation.</p>
                    <p className="text-xs leading-6">Iris can help revise {selectedEntryLabel}, suggest new steps, or explain the current prompt flow.</p>
                  </div>
                </div>
              ) : (
                <>
                  <SessionMessageList
                    getExpandedDetailEntries={inspectability.getExpandedDetailEntries}
                    isConversationUnitExpanded={inspectability.isConversationUnitExpanded}
                    onToggleConversationUnit={inspectability.toggleConversationUnit}
                    onToggleDetailEntry={inspectability.toggleDetailEntry}
                    renderAvatar={renderIrisAvatar}
                    renderDetailSheet={renderIrisDetailSheet}
                    renderedMessages={renderedMessages}
                    streamingMessage={streamingMessage}
                  />
                  {isSessionActive ? <IrisPendingBubble /> : null}
                </>
              )
            }
          </ChatThreadFrame>
        </div>
      </SheetContent>
    </Sheet>
  );
}