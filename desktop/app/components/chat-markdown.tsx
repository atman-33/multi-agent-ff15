import { memo, useState } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

export function stripAnsi(text: string): string {
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
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  const [wrap, setWrap] = useState(false);

  return (
    <div className="group relative my-1">
      <button
        className="absolute top-1 right-1 z-10 rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-muted-foreground/70 leading-none opacity-0 transition-opacity hover:bg-white/20 hover:text-foreground/80 group-hover:opacity-100"
        onClick={() => setWrap((value) => !value)}
        title={wrap ? "Switch to scroll mode" : "Switch to wrap mode"}
        type="button"
      >
        {wrap ? "→ scroll" : "↵ wrap"}
      </button>
      <pre
        className={cn(
          "min-w-0 max-w-full rounded bg-black/20 p-1.5 text-[11px]",
          wrap
            ? "overflow-x-hidden [&_code]:overflow-x-hidden [&_code]:whitespace-pre-wrap [&_code]:break-words"
            : "overflow-x-auto [&_code]:overflow-x-auto [&_code]:whitespace-pre"
        )}
      >
        {children}
      </pre>
    </div>
  );
}

const markdownComponents: Components = {
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
  code: ({ children, className }) => {
    const isBlock = className?.includes("language-");
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
    <ul className="list-disc space-y-0.5 pl-4">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal space-y-0.5 pl-4">{children}</ol>
  ),
  p: ({ children }) => <p className="my-0.5">{children}</p>,
  hr: () => <hr className="my-2 border-border/30" />,
  blockquote: ({ children }) => (
    <blockquote className="border-border/50 border-l-2 pl-2 text-muted-foreground italic">
      {children}
    </blockquote>
  ),
};

interface ChatMarkdownProps {
  className?: string;
  content: string;
}

function ChatMarkdown({ className, content }: ChatMarkdownProps) {
  return (
    <ReactMarkdown
      className={cn(className)}
      components={markdownComponents}
      remarkPlugins={[remarkGfm]}
    >
      {content}
    </ReactMarkdown>
  );
}

export default memo(ChatMarkdown);
