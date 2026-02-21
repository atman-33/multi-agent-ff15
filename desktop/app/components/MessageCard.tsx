import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { ChatLogRecord } from "@/lib/useAgentChatLog";

// ---------------------------------------------------------------------------
// ANSI removal (task 4.8 – frontend double-protection)
// ---------------------------------------------------------------------------

function stripAnsi(text: string): string {
  // CSI sequences (colors, cursor, etc.)
  // eslint-disable-next-line no-control-regex
  return text
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b[@-Z\\-_]/g, "")
    .replace(/[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]/g, ""); // other control chars
}

const FOLD_LINES = 12;

interface MessageCardProps {
  record: ChatLogRecord;
  className?: string;
}

export default function MessageCard({ record, className }: MessageCardProps) {
  const [expanded, setExpanded] = useState(false);

  const clean = stripAnsi(record.content);
  const lines = clean.split("\n");
  const shouldFold = lines.length > FOLD_LINES;
  const displayLines = shouldFold && !expanded ? lines.slice(0, FOLD_LINES) : lines;
  const displayText = displayLines.join("\n");

  const ts = new Date(record.ts);
  const timeStr = ts.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const isError = record.kind === "error";

  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 text-sm space-y-1",
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
              "px-1 rounded-sm font-medium",
              isError ? "bg-red-500/20 text-red-400" : "bg-muted/40"
            )}
          >
            {record.kind}
          </span>
        )}
      </div>

      {/* Content */}
      <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground/90">
        {displayText}
      </pre>

      {/* Fold toggle */}
      {shouldFold && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors mt-1"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3" />
              折りたたむ
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />
              {lines.length - FOLD_LINES} 行を展開
            </>
          )}
        </button>
      )}
    </div>
  );
}
