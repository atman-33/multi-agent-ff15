import { ChevronDown, ChevronUp } from "lucide-react";
import { memo, useMemo, useState } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatLogRecord } from "@/lib/use-agent-chat-log";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// ANSI removal (frontend double-protection)
// ---------------------------------------------------------------------------

function stripAnsi(text: string): string {
  // CSI sequences (colors, cursor, etc.)
  return (
    text
      // biome-ignore lint/suspicious/noControlCharactersInRegex: necessary for stripping ANSI codes
      .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
      // biome-ignore lint/suspicious/noControlCharactersInRegex: necessary for stripping ANSI codes
      .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
      // biome-ignore lint/suspicious/noControlCharactersInRegex: necessary for stripping ANSI codes
      .replace(/\x1b[@-Z\\-_]/g, "")
      // biome-ignore lint/suspicious/noControlCharactersInRegex: necessary for stripping ANSI codes
      .replace(/[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]/g, "")
  ); // other control chars
}

const FOLD_CHARS = 800;

/** Code block with wrap/scroll toggle button (appears on hover). */
function CodeBlock({ children }: { children: React.ReactNode }) {
  const [wrap, setWrap] = useState(false);
  return (
    <div className="group relative my-1">
      <button
        className="absolute top-1 right-1 z-10 rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-muted-foreground/70 leading-none opacity-0 transition-opacity hover:bg-white/20 hover:text-foreground/80 group-hover:opacity-100"
        onClick={() => setWrap((v) => !v)}
        title={wrap ? "Switch to scroll mode" : "Switch to wrap mode"}
        type="button"
      >
        {wrap ? "→ scroll" : "↵ wrap"}
      </button>
      <pre
        className={cn(
          "max-w-full min-w-0 rounded bg-black/20 p-1.5 text-[11px]",
          wrap
            ? "overflow-x-hidden [&_code]:overflow-x-hidden [&_code]:whitespace-pre-wrap [&_code]:break-words"
            : "overflow-x-auto [&_code]:overflow-x-auto [&_code]:whitespace-pre",
        )}
      >
        {children}
      </pre>
    </div>
  );
}

interface MessageCardProps {
  className?: string;
  record: ChatLogRecord;
}

function MessageCard({ record, className }: MessageCardProps) {
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

  const mdComponents = useMemo<Components>(
    () => ({
      img: () => null,
      a: ({ href, children }) => (
        <a
          className="text-blue-400 underline hover:text-blue-300"
          href={href}
          rel="noopener noreferrer"
          target="_blank"
        >
          {children}
        </a>
      ),
      h1: ({ children }) => (
        <h1 className="mt-2 mb-1 font-bold text-sm">{children}</h1>
      ),
      h2: ({ children }) => (
        <h2 className="mt-2 mb-1 font-bold text-xs">{children}</h2>
      ),
      h3: ({ children }) => (
        <h3 className="mt-1 mb-0.5 font-semibold text-xs">{children}</h3>
      ),
      code: ({ children, className: cls }) => {
        const isBlock = cls?.includes("language-");
        return isBlock ? (
          <code className="block overflow-x-auto whitespace-pre rounded bg-black/30 px-2 py-1 font-mono text-[11px]">
            {children}
          </code>
        ) : (
          <code className="rounded bg-black/30 px-1 font-mono text-[11px]">
            {children}
          </code>
        );
      },
      pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
      ul: ({ children }) => (
        <ul className="list-inside list-disc space-y-0.5 pl-2">{children}</ul>
      ),
      ol: ({ children }) => (
        <ol className="list-inside list-decimal space-y-0.5 pl-2">
          {children}
        </ol>
      ),
      p: ({ children }) => <p className="my-0.5">{children}</p>,
      hr: () => <hr className="my-2 border-border/30" />,
      blockquote: ({ children }) => (
        <blockquote className="border-border/50 border-l-2 pl-2 text-muted-foreground italic">
          {children}
        </blockquote>
      ),
    }),
    [],
  );

  return (
    <div
      className={cn(
        "space-y-1 rounded-md border px-3 py-2 text-sm",
        isError
          ? "border-red-500/40 bg-red-500/10 text-red-300"
          : "border-border/40 bg-white/5",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <span>{timeStr}</span>
        {record.kind !== "answer" && (
          <span
            className={cn(
              "rounded-sm px-1 font-medium",
              isError ? "bg-red-500/20 text-red-400" : "bg-muted/40",
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
          shouldFold && !expanded && "max-h-48 overflow-hidden",
        )}
      >
        <ReactMarkdown
          className="space-y-1 text-foreground/90 text-xs leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
          components={mdComponents}
          remarkPlugins={[remarkGfm]}
        >
          {clean}
        </ReactMarkdown>
        {/* Gradient fade when folded */}
        {shouldFold && !expanded && (
          <div className="pointer-events-none absolute right-0 bottom-0 left-0 h-8 bg-gradient-to-t from-white/5 to-transparent" />
        )}
      </div>

      {/* Fold toggle */}
      {shouldFold && (
        <button
          className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => setExpanded((v) => !v)}
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
  );
}

export default memo(MessageCard);
