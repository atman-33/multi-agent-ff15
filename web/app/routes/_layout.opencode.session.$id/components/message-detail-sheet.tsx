import { Check, Copy } from "lucide-react";
import { useState } from "react";
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

type Props = {
  content: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  role: "user" | "assistant";
};

const MessageDetailSheet = ({ content, onOpenChange, open, role }: Props) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!content.trim()) {
      return;
    }

    navigator.clipboard.writeText(content).then(() => {
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
              <SheetTitle>{role === "user" ? "User message detail" : "Assistant message detail"}</SheetTitle>
              <SheetDescription className="text-slate-400">
                Full markdown detail view
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
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
            <div className="markdown-body text-[13px] leading-6 [&_li]:leading-6 [&_p]:leading-6">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{content}</ReactMarkdown>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MessageDetailSheet;