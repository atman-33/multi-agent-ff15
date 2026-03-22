import { ArrowUpRight, Check, Copy } from "lucide-react";
import { type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  align: "start" | "end";
  senderLabel: string;
  timestamp: Date;
  avatar?: ReactNode;
  senderMetaClassName?: string;
  contentColumnClassName?: string;
  bubbleClassName: string;
  body: ReactNode;
  details?: ReactNode;
  copyContent: string;
  renderDetailSheet: (args: { open: boolean; onOpenChange: (open: boolean) => void }) => ReactNode;
};

export function MessageBubbleBase({
  align,
  senderLabel,
  timestamp,
  avatar,
  senderMetaClassName,
  contentColumnClassName,
  bubbleClassName,
  body,
  details,
  copyContent,
  renderDetailSheet,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const handleCopy = () => {
    if (!copyContent.trim()) {
      return;
    }

    navigator.clipboard.writeText(copyContent).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div
      className={cn(
        "group flex min-w-0 max-w-full items-end gap-2",
        align === "end" ? "justify-end" : "justify-start"
      )}
    >
      {align === "start" ? (avatar ?? null) : null}

      <div
        className={cn(
          "flex min-w-0 max-w-[84%] flex-col",
          align === "end" ? "items-end" : "items-start",
          contentColumnClassName
        )}
      >
        <div
          className={cn(
            "mb-1 flex items-center gap-2 px-1 font-mono text-[10px] uppercase tracking-widest",
            align === "end" ? "text-primary/70" : "text-muted-foreground/65",
            senderMetaClassName
          )}
        >
          <span className="font-semibold">{senderLabel}</span>
          {timestamp.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}
        </div>

        <div
          className={cn(
            "relative min-w-0 max-w-full overflow-x-hidden rounded-2xl border px-4 py-3 text-sm shadow-[0_8px_24px_rgba(15,23,42,0.12)] backdrop-blur-xs",
            bubbleClassName
          )}
        >
          {body}
          {details}
        </div>

        <div className="mt-1 flex h-7 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            onClick={() => setDetailOpen(true)}
            type="button"
          >
            <ArrowUpRight className="h-3 w-3" />
            Open detail
          </button>
          <button
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            onClick={handleCopy}
            type="button"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        {renderDetailSheet({ open: detailOpen, onOpenChange: setDetailOpen })}
      </div>
    </div>
  );
}
