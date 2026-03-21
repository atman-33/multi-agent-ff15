import { ArrowUpRight, BadgeInfo, Check, ChevronDown, Copy } from "lucide-react";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { parseInternalContext, removeInternalContext } from "./internal-context";

type Props = {
  content: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  role: "noctis" | "user";
};

const MessageDetailSheet = ({ content, onOpenChange, open, role }: Props) => {
  const [copied, setCopied] = useState(false);
  const [contextExpanded, setContextExpanded] = useState(false);
  const internalContext = useMemo(() => parseInternalContext(content), [content]);
  const displayContent = useMemo(() => removeInternalContext(content), [content]);
  const copyContent = displayContent.trim() ? displayContent : content;

  const handleCopy = () => {
    if (!copyContent.trim()) {
      return;
    }

    navigator.clipboard.writeText(copyContent).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="flex w-[96vw] max-w-[96vw] flex-col gap-0 border-white/10 bg-slate-950/96 p-0 text-slate-100 backdrop-blur-xl sm:max-w-2xl lg:max-w-3xl xl:max-w-4xl"
        side="right"
      >
        <SheetHeader className="border-b border-white/10 px-5 py-4 text-left sm:px-6">
          <div className="flex items-start justify-between gap-3 pr-8">
            <div className="space-y-2">
              <SheetTitle>
                {role === "user" ? "Your message detail" : "Noctis message detail"}
              </SheetTitle>
              <SheetDescription className="text-slate-400">
                Full message view
              </SheetDescription>
            </div>

            <Button
              className="shrink-0 border-white/10 text-slate-100 hover:bg-white/10 hover:text-white"
              onClick={handleCopy}
              size="sm"
              type="button"
              variant="outline"
            >
              {copied ? (
                <>
                  <Check className="mr-1 h-3.5 w-3.5 text-emerald-400" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="mr-1 h-3.5 w-3.5" />
                  Copy
                </>
              )}
            </Button>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-slate-300">
            <ArrowUpRight className="h-3.5 w-3.5" />
            {role === "user" ? "You" : "Noctis"}
          </div>

          {internalContext ? (
            <div className="mb-4 rounded-xl border border-sky-500/20 bg-sky-500/5 px-3 py-3">
              <button
                className="flex w-full min-w-0 items-center gap-2 text-left"
                onClick={() => setContextExpanded((value) => !value)}
                type="button"
              >
                <BadgeInfo className="h-4 w-4 shrink-0 text-sky-300" />
                <span className="shrink-0 text-xs font-medium text-sky-100">
                  Internal Context
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-sky-100/80">
                  {internalContext.summary}
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-sky-200/70 transition-transform duration-300 ease-out",
                    contextExpanded ? "rotate-180" : "rotate-0"
                  )}
                />
              </button>

              <div
                className={cn(
                  "grid transition-all duration-300 ease-out",
                  contextExpanded ? "mt-3 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0"
                )}
              >
                <div className="overflow-hidden">
                  <pre className="overflow-x-auto rounded-lg border border-sky-500/10 bg-black/20 p-3 font-mono text-[11px] whitespace-pre-wrap wrap-break-word text-sky-50/85">
                    {internalContext.raw}
                  </pre>
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
            {role === "user" ? (
              <p className="whitespace-pre-wrap text-[13px] leading-6 text-slate-100">
                {displayContent}
              </p>
            ) : (
              <div className="markdown-body text-[13px] leading-6 [&_li]:leading-6 [&_p]:leading-6">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{displayContent}</ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MessageDetailSheet;