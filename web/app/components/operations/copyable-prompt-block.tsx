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
  highlightTexts?: string[];
};

function renderHighlightedText(value: string, highlightTexts: string[]) {
  const normalizedHighlights = highlightTexts
    .map((item) => item.trim())
    .filter((item, index, arr) => item.length > 0 && arr.indexOf(item) === index)
    .sort((left, right) => right.length - left.length);

  if (normalizedHighlights.length === 0) {
    return value;
  }

  const segments: Array<{ start: number; text: string; highlighted: boolean }> = [];
  let cursor = 0;

  while (cursor < value.length) {
    const matched = normalizedHighlights.find((highlight) => value.startsWith(highlight, cursor));
    if (matched) {
      segments.push({ start: cursor, text: matched, highlighted: true });
      cursor += matched.length;
      continue;
    }

    let nextCursor = cursor + 1;
    while (nextCursor < value.length) {
      const nextMatched = normalizedHighlights.find((highlight) => value.startsWith(highlight, nextCursor));
      if (nextMatched) {
        break;
      }
      nextCursor += 1;
    }

    segments.push({ start: cursor, text: value.slice(cursor, nextCursor), highlighted: false });
    cursor = nextCursor;
  }

  return segments.map((segment) =>
    segment.highlighted ? (
      <span className="bg-red-950/50 text-red-300" key={`${segment.start}-${segment.text.length}`}>
        {segment.text}
      </span>
    ) : (
      <span key={`${segment.start}-${segment.text.length}`}>{segment.text}</span>
    ),
  );
}

export function CopyablePromptBlock({
  value,
  title,
  description,
  headerContent,
  className,
  preClassName,
  highlightTexts = [],
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
    <div
      className={cn(
        "rounded-xl border border-slate-700/70 bg-slate-900/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] backdrop-blur-sm",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 border-slate-800/70 border-b bg-white/2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          {headerContent ? headerContent : null}
          {!headerContent && title ? <div className="font-medium text-slate-100 text-sm">{title}</div> : null}
          {!headerContent && description ? <div className="mt-1 text-slate-400 text-xs">{description}</div> : null}
        </div>
        <Button
          className="shrink-0 border-slate-700/80 bg-slate-950/45 backdrop-blur-sm hover:bg-slate-900/60"
          onClick={() => void handleCopy()}
          size="sm"
          variant="outline"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre
        className={cn(
          "max-h-136 overflow-auto bg-black/20 p-4 font-mono text-[12px] leading-5 whitespace-pre-wrap text-slate-100",
          preClassName,
        )}
      >
        {renderHighlightedText(value, highlightTexts)}
      </pre>
    </div>
  );
}