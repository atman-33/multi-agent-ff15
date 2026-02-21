import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { ChatLogRecord } from "@/lib/useAgentChatLog";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ---------------------------------------------------------------------------
// ANSI removal (frontend double-protection)
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

const FOLD_CHARS = 800;

interface MessageCardProps {
  record: ChatLogRecord;
  className?: string;
}

export default function MessageCard({ record, className }: MessageCardProps) {
  const [expanded, setExpanded] = useState(false);

  const clean = stripAnsi(record.content);
  const shouldFold = clean.length > FOLD_CHARS;

  const ts = new Date(record.ts);
  const timeStr = ts.toLocaleTimeString("en-US", {
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

      {/* Content — markdown preview with fade-clip when folded */}
      <div className={cn("relative", shouldFold && !expanded && "max-h-48 overflow-hidden")}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          className="text-xs leading-relaxed text-foreground/90 space-y-1 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
          components={{
            // Suppress image embeds for safety
            img: () => null,
            // Open links in system browser
            a: ({ href, children }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 underline hover:text-blue-300"
              >
                {children}
              </a>
            ),
            // Headings
            h1: ({ children }) => <h1 className="text-sm font-bold mt-2 mb-1">{children}</h1>,
            h2: ({ children }) => <h2 className="text-xs font-bold mt-2 mb-1">{children}</h2>,
            h3: ({ children }) => <h3 className="text-xs font-semibold mt-1 mb-0.5">{children}</h3>,
            // Code blocks & inline code
            code: ({ children, className: cls }) => {
              const isBlock = cls?.includes("language-");
              return isBlock ? (
                <code className="block bg-black/30 rounded px-2 py-1 font-mono text-[11px] overflow-x-auto whitespace-pre">
                  {children}
                </code>
              ) : (
                <code className="bg-black/30 rounded px-1 font-mono text-[11px]">{children}</code>
              );
            },
            pre: ({ children }) => <pre className="my-1">{children}</pre>,
            // Lists
            ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5 pl-2">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal list-inside space-y-0.5 pl-2">{children}</ol>,
            // Paragraphs
            p: ({ children }) => <p className="my-0.5">{children}</p>,
            // Horizontal rule
            hr: () => <hr className="border-border/30 my-2" />,
            // Blockquote
            blockquote: ({ children }) => (
              <blockquote className="border-l-2 border-border/50 pl-2 italic text-muted-foreground">
                {children}
              </blockquote>
            ),
          }}
        >
          {clean}
        </ReactMarkdown>
        {/* Gradient fade when folded */}
        {shouldFold && !expanded && (
          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white/5 to-transparent pointer-events-none" />
        )}
      </div>

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
  );
}
