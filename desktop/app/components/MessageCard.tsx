import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { ChatLogRecord } from "@/lib/useAgentChatLog";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
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

/** Code block with wrap/scroll toggle button (appears on hover). */
function CodeBlock({ children }: { children: React.ReactNode }) {
  const [wrap, setWrap] = useState(false);
  return (
    <div className="relative group my-1">
      <button
        type="button"
        onClick={() => setWrap((v) => !v)}
        title={wrap ? "スクロールモードに切り替え" : "折り返しモードに切り替え"}
        className="absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-white/10 hover:bg-white/20 rounded px-1.5 py-0.5 text-[9px] text-muted-foreground/70 hover:text-foreground/80 leading-none"
      >
        {wrap ? "→ scroll" : "↵ wrap"}
      </button>
      <pre
        className={cn(
          "max-w-full bg-black/20 rounded p-1.5 text-[11px]",
          wrap ? "whitespace-pre-wrap break-words" : "overflow-x-auto"
        )}
      >
        {children}
      </pre>
    </div>
  );
}

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

  // Stable reference — prevents CodeBlock from unmounting on every 3s poll re-render
  const mdComponents = useMemo<Components>(() => ({
    img: () => null,
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300">
        {children}
      </a>
    ),
    h1: ({ children }) => <h1 className="text-sm font-bold mt-2 mb-1">{children}</h1>,
    h2: ({ children }) => <h2 className="text-xs font-bold mt-2 mb-1">{children}</h2>,
    h3: ({ children }) => <h3 className="text-xs font-semibold mt-1 mb-0.5">{children}</h3>,
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
    pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
    ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5 pl-2">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal list-inside space-y-0.5 pl-2">{children}</ol>,
    p: ({ children }) => <p className="my-0.5">{children}</p>,
    hr: () => <hr className="border-border/30 my-2" />,
    blockquote: ({ children }) => (
      <blockquote className="border-l-2 border-border/50 pl-2 italic text-muted-foreground">
        {children}
      </blockquote>
    ),
  }), []);

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
          components={mdComponents}
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
