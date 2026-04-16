import { PromptComposer } from "@/components/chat/prompt-composer";
import { ChatThreadFrame } from "@/components/chat/thread-frame";
import { MessageMarkdown } from "@/components/chat/message-markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type {
  SessionChatScrollSignal,
} from "@/lib/session-chat-rendering-orchestration";
import type { RenderedSessionMessage } from "@/lib/session-message-presentation";
import { isSessionStatusActive, type SessionStatus } from "@/lib/session-status";
import type { PromptPart } from "@/lib/prompt-parts";

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
  renderedMessages: RenderedSessionMessage[];
  scopeLabel: string;
  scrollSignal: SessionChatScrollSignal;
  selectedEntryLabel: string;
  sessionId: string | null;
  sessionStatus: SessionStatus | null;
  streamingMessage: RenderedSessionMessage | null;
  targetLabel: string;
}

function getDisplayedMessageContent(message: RenderedSessionMessage): string {
  return message.messageDisplay.displayContent || message.content || message.detailRawText;
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
  renderedMessages,
  scopeLabel,
  scrollSignal,
  selectedEntryLabel,
  sessionId,
  sessionStatus,
  streamingMessage,
  targetLabel,
}: IrisAuthoringSheetProps) {
  const statusLabel = buildStatusLabel({
    isLoading,
    isSending,
    sessionId,
    sessionStatus,
  });

  return (
    <Sheet onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
    }} open={isOpen}>
      <SheetContent className="flex h-full flex-col gap-0 overflow-hidden border-slate-800/70 bg-slate-950/92 p-0 text-slate-100 backdrop-blur-xl sm:max-w-2xl" side="right">
        <SheetHeader className="border-slate-800/70 border-b bg-white/2 px-5 py-4 text-left">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <img alt="Iris portrait" className="h-14 w-14 rounded-2xl border border-cyan-300/20 object-cover shadow-lg" src="/images/iris.png" />
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

            <Button onClick={onNewSession} size="sm" type="button" variant="outline">
              New Session
            </Button>
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
                  helperText={
                    <span className="text-xs text-slate-400">
                      Studio context: {conversationSummary}
                    </span>
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
              renderedMessages.length === 0 && !streamingMessage ? (
                <div className="flex min-h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center text-slate-400">
                  <img alt="Iris portrait" className="h-20 w-20 rounded-3xl border border-cyan-300/15 object-cover shadow-lg" src="/images/iris.png" />
                  <div className="space-y-1">
                    <p className="font-medium text-slate-200 text-sm">Start a Studio-scoped conversation.</p>
                    <p className="text-xs leading-6">Iris can help revise {selectedEntryLabel}, suggest new steps, or explain the current prompt flow.</p>
                  </div>
                </div>
              ) : (
                <>
                  {renderedMessages.map((message) => {
                    const content = getDisplayedMessageContent(message);
                    const isUser = message.messageDisplay.resolvedSenderIsUser;
                    return (
                      <div
                        className={isUser ? "flex justify-end" : "flex justify-start"}
                        key={message.conversationUnitId}
                      >
                        <div
                          className={isUser
                            ? "max-w-[84%] rounded-2xl rounded-br-md border border-primary/20 bg-primary/12 px-4 py-3 text-sm text-foreground"
                            : "max-w-[84%] rounded-2xl rounded-bl-md border border-slate-700/70 bg-white/6 px-4 py-3 text-sm text-slate-100"
                          }
                        >
                          <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-slate-400">
                            {message.senderLabel}
                          </div>
                          {isUser ? (
                            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-100">{content}</p>
                          ) : (
                            <div className="markdown-body text-sm leading-6">
                              <MessageMarkdown>{content}</MessageMarkdown>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {streamingMessage ? (
                    <div className="flex justify-start">
                      <div className="max-w-[84%] rounded-2xl rounded-bl-md border border-slate-700/70 bg-white/6 px-4 py-3 text-sm text-slate-100">
                        <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-slate-400">
                          {streamingMessage.senderLabel}
                        </div>
                        <div className="markdown-body text-sm leading-6">
                          <MessageMarkdown>{getDisplayedMessageContent(streamingMessage)}</MessageMarkdown>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </>
              )
            }
          </ChatThreadFrame>
        </div>
      </SheetContent>
    </Sheet>
  );
}