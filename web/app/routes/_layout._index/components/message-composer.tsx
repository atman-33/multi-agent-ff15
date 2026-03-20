import { useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ArrowUp } from "lucide-react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
};

const MessageComposer = ({ value, onChange, onSubmit, disabled }: Props) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (value.trim() && !disabled) {
          onSubmit();
        }
      }
    },
    [value, disabled, onSubmit]
  );

  return (
    <div className="relative flex items-end gap-2 rounded-xl border border-border/60 bg-card p-3 shadow-sm">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="メッセージを入力… (Shift+Enter で改行)"
        disabled={disabled}
        rows={1}
        className={cn(
          "min-h-[36px] max-h-48 flex-1 resize-none border-0 bg-transparent p-0 shadow-none",
          "focus-visible:ring-0 text-sm placeholder:text-muted-foreground/60"
        )}
      />
      <Button
        size="icon"
        onClick={onSubmit}
        disabled={!value.trim() || disabled}
        className="h-8 w-8 shrink-0 rounded-lg"
      >
        <ArrowUp className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default MessageComposer;
