import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import type { MessagePart } from "../types";

type Props = {
  role: "user" | "assistant";
  parts: MessagePart[];
};

const MessageBubble = ({ role, parts }: Props) => {
  const isUser = role === "user";
  const text = parts
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");
  const reasoning = parts
    .filter((part) => part.type === "reasoning")
    .map((part) => part.text ?? "")
    .join("");
  const tools = parts.filter((part) => part.type === "tool");

  if (!text && !reasoning && tools.length === 0) {
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
