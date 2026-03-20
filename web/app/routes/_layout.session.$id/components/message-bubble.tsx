import { BadgeInfo, ChevronDown } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { MessagePart } from "../types";

type Props = {
  role: "user" | "assistant";
  parts: MessagePart[];
};

type InternalContextViewModel = {
  entries: Array<{ key: string; value: string }>;
  summary: string;
};

const INTERNAL_CONTEXT_BLOCK_REGEX = /<internal-context>([\s\S]*?)<\/internal-context>/;
const INTERNAL_CONTEXT_REMOVE_REGEX = /<internal-context>[\s\S]*?<\/internal-context>/g;

function parseInternalContext(content: string): InternalContextViewModel | null {
  const match = content.match(INTERNAL_CONTEXT_BLOCK_REGEX);
  if (!match) {
    return null;
  }

  const entries = (match[1] ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex === -1) {
        return { key: line, value: "" };
      }

      return {
        key: line.slice(0, separatorIndex).trim(),
        value: line.slice(separatorIndex + 1).trim(),
      };
    });

  if (entries.length === 0) {
    return {
      entries: [],
      summary: "Injected internal context",
    };
  }

  const sessionEntry = entries.find((entry) => entry.key === "session_id");

  return {
    entries,
    summary: sessionEntry?.value ? `Session ${sessionEntry.value}` : "Injected internal context",
  };
}

function removeInternalContext(content: string): string {
  return content.replace(INTERNAL_CONTEXT_REMOVE_REGEX, "").trim();
}

const MessageBubble = ({ role, parts }: Props) => {
  const [contextExpanded, setContextExpanded] = useState(false);
  const isUser = role === "user";
  const rawText = parts
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");
  const internalContext = useMemo(() => parseInternalContext(rawText), [rawText]);
  const text = useMemo(() => removeInternalContext(rawText), [rawText]);
  const reasoning = parts
    .filter((part) => part.type === "reasoning")
    .map((part) => part.text ?? "")
    .join("");
  const tools = parts.filter((part) => part.type === "tool");

  if (!text && !reasoning && tools.length === 0 && !internalContext) {
    return null;
  }

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-xl border px-3 py-2 shadow-[0_8px_24px_rgba(15,23,42,0.12)] backdrop-blur-sm",
          isUser
            ? "rounded-br-md border-sky-500/15 bg-sky-500/[0.08] text-foreground/90"
            : "rounded-bl-md border-border/40 bg-white/[0.045] text-foreground"
        )}
      >
        {internalContext ? (
          <div className="mb-3 rounded-md border border-sky-500/20 bg-sky-500/5 px-2.5 py-1.5">
            <button
              className="flex w-full min-w-0 items-center gap-2 text-left"
              onClick={() => setContextExpanded((value) => !value)}
              type="button"
            >
              <BadgeInfo className="h-3.5 w-3.5 shrink-0 text-sky-300" />
              <span className="shrink-0 text-[11px] font-medium text-sky-100">
                Internal Context
              </span>
              <span className="shrink-0 rounded-full border border-sky-500/20 bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-200/80">
                Injected
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-sky-100/80">
                {internalContext.summary}
              </span>
              <ChevronDown
                className={cn(
                  "ml-auto h-3 w-3 text-sky-200/70 transition-transform duration-300 ease-out",
                  contextExpanded ? "rotate-180" : "rotate-0"
                )}
              />
            </button>

            <div
              className={cn(
                "grid transition-all duration-300 ease-out",
                contextExpanded ? "mt-2 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0"
              )}
            >
              <div className="overflow-hidden">
                <div
                  className={cn(
                    "grid gap-2 border-t border-sky-500/10 pt-2 text-[11px] text-sky-50/85 transition-all duration-300 ease-out",
                    contextExpanded ? "translate-y-0" : "-translate-y-1"
                  )}
                >
                  {internalContext.entries.map((entry) => (
                    <div key={`${entry.key}-${entry.value}`}>
                      <div className="uppercase tracking-[0.12em] text-sky-200/60">{entry.key}</div>
                      <div className="break-all font-mono text-[10px] text-sky-100/80">
                        {entry.value || "-"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {text &&
          (isUser ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{text}</p>
          ) : (
            <div className="markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{text}</ReactMarkdown>
            </div>
          ))}

        {reasoning && <p className="mt-2 text-xs italic text-muted-foreground">{reasoning}</p>}

        {tools.length > 0 && (
          <div className="mt-3 space-y-2">
            {tools.map((tool, index) => (
              <details
                key={`${tool.tool ?? "tool"}-${index}`}
                className="rounded-md border border-border/40 bg-black/10 p-2"
              >
                <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
                  {tool.tool ?? "Tool"}
                </summary>
                <div className="mt-2 text-xs text-muted-foreground">
                  {tool.state?.status && (
                    <div className="mb-1">
                      Status:{" "}
                      <span
                        className={cn(
                          "font-semibold",
                          tool.state.status === "completed" && "text-emerald-400",
                          tool.state.status === "error" && "text-destructive"
                        )}
                      >
                        {tool.state.status}
                      </span>
                    </div>
                  )}
                  {tool.state?.input && (
                    <pre className="whitespace-pre-wrap rounded-md bg-black/10 p-2 text-[11px]">
                      {JSON.stringify(tool.state.input, null, 2)}
                    </pre>
                  )}
                  {tool.state?.output && (
                    <pre className="mt-2 whitespace-pre-wrap rounded-md bg-black/10 p-2 text-[11px]">
                      {tool.state.output}
                    </pre>
                  )}
                  {tool.state?.error && (
                    <div className="mt-2 text-xs text-destructive">{tool.state.error}</div>
                  )}
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageBubble;
