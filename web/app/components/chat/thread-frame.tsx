import { ArrowDown } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getAutoFollowScrollBehavior,
  shouldAutoFollowThreadUpdate,
} from "@/lib/chat-thread-scroll-policy";
import type { SessionChatScrollSignal } from "@/lib/session-chat-rendering-orchestration";

type ChatThreadFrameProps = {
  header?: ReactNode;
  footer?: ReactNode;
  children: (viewportRef: React.RefObject<HTMLDivElement | null>) => ReactNode;
  outerClassName?: string;
  scrollAreaClassName?: string;
  viewportClassName?: string;
  contentClassName?: string;
  resetKey?: string | null;
  autoFollowKey?: string | null;
  scrollSignal?: SessionChatScrollSignal;
};

export function ChatThreadFrame({
  header,
  footer,
  children,
  outerClassName,
  scrollAreaClassName = "h-full min-w-0 px-4 py-4",
  viewportClassName,
  contentClassName = "mx-auto w-full min-w-0 max-w-3xl space-y-4 overflow-x-hidden",
  resetKey,
  autoFollowKey = null,
  scrollSignal = "none",
}: ChatThreadFrameProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const previousAutoFollowKeyRef = useRef<string | null>(null);
  const previousResetKeyRef = useRef(resetKey);
  const shouldStickToBottomRef = useRef(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const syncScrollState = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    const nearBottom = distanceFromBottom < 72;

    shouldStickToBottomRef.current = nearBottom;
    setShowScrollToBottom(!nearBottom);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    viewport.scrollTo({ top: viewport.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    if (!autoFollowKey || previousAutoFollowKeyRef.current === autoFollowKey) {
      return;
    }

    previousAutoFollowKeyRef.current = autoFollowKey;
    if (
      shouldAutoFollowThreadUpdate({
        nearBottom: shouldStickToBottomRef.current,
        scrollSignal,
      })
    ) {
      const behavior = getAutoFollowScrollBehavior(scrollSignal);
      window.setTimeout(() => scrollToBottom(behavior), 0);
    }
  }, [autoFollowKey, scrollSignal, scrollToBottom]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    syncScrollState();

    const handleScroll = () => {
      syncScrollState();
    };

    viewport.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      viewport.removeEventListener("scroll", handleScroll);
    };
  }, [syncScrollState]);

  useEffect(() => {
    if (previousResetKeyRef.current === resetKey) {
      return;
    }

    previousResetKeyRef.current = resetKey;
    previousAutoFollowKeyRef.current = null;
    shouldStickToBottomRef.current = true;
    setShowScrollToBottom(false);
    window.setTimeout(() => scrollToBottom("auto"), 0);
  }, [resetKey, scrollToBottom]);

  return (
    <div className={outerClassName ?? "flex h-full min-h-0 min-w-0 flex-col overflow-hidden"}>
      {header}

      <div className="relative min-h-0 min-w-0 flex-1">
        <ScrollArea
          className={scrollAreaClassName}
          viewportClassName={viewportClassName}
          viewportRef={viewportRef}
        >
          <div className={contentClassName}>{children(viewportRef)}</div>
        </ScrollArea>

        {showScrollToBottom ? (
          <Button
            aria-label="Scroll to latest message"
            className="absolute right-8 bottom-6 h-10 w-10 rounded-full border border-white/10 bg-slate-950/90 p-0 text-slate-100 shadow-lg backdrop-blur hover:bg-slate-900"
            onClick={() => scrollToBottom()}
            size="sm"
            title="Scroll to latest message"
            type="button"
            variant="outline"
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      {footer}
    </div>
  );
}
