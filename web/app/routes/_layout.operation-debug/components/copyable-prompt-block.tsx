import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CopyablePromptBlockProps = {
  value: string;
  title?: string;
  description?: string;
  headerContent?: React.ReactNode;
  className?: string;
  preClassName?: string;
};

export function CopyablePromptBlock({
  value,
  title,
  description,
  headerContent,
  className,
  preClassName,
}: CopyablePromptBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!value.trim()) {
      return;
    }

    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={cn("rounded-lg border border-slate-700 bg-slate-950", className)}>
      <div className="flex items-start justify-between gap-3 border-slate-800 border-b px-3 py-2.5">
        <div className="min-w-0 flex-1">
          {headerContent ? headerContent : null}
          {!headerContent && title ? <div className="font-medium text-slate-100 text-sm">{title}</div> : null}
          {!headerContent && description ? <div className="mt-1 text-slate-400 text-xs">{description}</div> : null}
        </div>
        <Button className="shrink-0" onClick={() => void handleCopy()} size="sm" variant="outline">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre
        className={cn(
          "max-h-[34rem] overflow-auto p-4 font-mono text-[12px] leading-5 whitespace-pre-wrap text-slate-100",
          preClassName,
        )}
      >
        {value}
      </pre>
    </div>
  );
}
