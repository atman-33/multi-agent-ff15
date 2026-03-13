import { ArrowUpRight, Check, ChevronDown, ChevronUp, Copy } from "lucide-react";
import { memo, useCallback, useState } from "react";
import ChatMarkdown, { stripAnsi } from "@/components/chat-markdown";
import {
  MESSAGE_PREVIEW_MAX_CHARS,
  type ChatDetailItem,
} from "@/lib/chat-detail";
import type { ChatTimelineMessageItem } from "@/lib/chat-timeline";
import { cn } from "@/lib/utils";

interface MessageCardProps {
  className?: string;
  onOpenDetail?: (item: ChatDetailItem) => void;
  record: ChatTimelineMessageItem;
}

function MessageCard({ record, className, onOpenDetail }: MessageCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const clean = stripAnsi(record.content);
    navigator.clipboard.writeText(clean).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [record.content]);

  const clean = stripAnsi(record.content);
  const shouldFold = clean.length > MESSAGE_PREVIEW_MAX_CHARS;

  const ts = new Date(record.lastTs);
  const timeStr = ts.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const isError = record.kind === "error";

  return (
    <div className="group/card">
      <div
        className={cn(
          "space-y-1 rounded-md border px-3 py-2 text-sm",
          isError
            ? "border-red-500/40 bg-red-500/10 text-red-300"
            : "border-border/40 bg-white/5",
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>{timeStr}</span>
          {record.kind !== "answer" && (
            <span
              className={cn(
                "rounded-sm px-1 font-medium",
                isError ? "bg-red-500/20 text-red-400" : "bg-muted/40"
              )}
            >
              {record.kind}
            </span>
          )}
        </div>

        {/* Content — markdown preview with fade-clip when folded */}
        <div
          className={cn(
            "relative",
            shouldFold && !expanded && "max-h-48 overflow-hidden"
          )}
        >
          <ChatMarkdown
            className="space-y-1 text-foreground/90 text-xs leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
            content={clean}
          />
          {/* Gradient fade when folded */}
          {shouldFold && !expanded && (
            <div className="pointer-events-none absolute right-0 bottom-0 left-0 h-8 bg-gradient-to-t from-white/5 to-transparent" />
          )}
        </div>

        {shouldFold && (
          <button
            className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => setExpanded((value) => !value)}
            type="button"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3 w-3" />
                Collapse
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                Show more
              </>
            )}
          </button>
        )}
      </div>

      {/* Copy button — shown on card hover, outside the card border */}
      <div className="mt-1 flex justify-start gap-2 opacity-0 transition-opacity group-hover/card:opacity-100">
        {onOpenDetail && (
          <button
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
            onClick={() => onOpenDetail({ type: "message", item: record })}
            title="Open larger message view"
            type="button"
          >
            <ArrowUpRight className="h-3 w-3" />
            Open detail
          </button>
        )}
        <button
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          onClick={handleCopy}
          title="Copy as markdown"
          type="button"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-green-400" />
              <span className="text-green-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default memo(MessageCard);
