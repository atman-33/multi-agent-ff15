import { useEffect, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Send, Radio } from "lucide-react";

export interface ChatMessage {
  id: string;
  role: "noctis" | "user";
  content: string;
  timestamp: Date;
}

interface ChatAreaProps {
  messages: ChatMessage[];
  isResponding: boolean;
  onSend: (message: string) => void;
}

const MessageBubble = ({ message }: { message: ChatMessage }) => {
  const isNoctis = message.role === "noctis";

  return (
    <div
      className={cn(
        "flex items-end gap-2",
        isNoctis ? "justify-start" : "justify-end"
      )}
    >
      {isNoctis && (
        <img
          alt="Noctis"
          src="/images/noctis.png"
          className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-primary/30"
        />
      )}
      <div
        className={cn(
          "max-w-[75%] rounded-xl px-3 py-2 text-sm",
          isNoctis
            ? "rounded-bl-sm bg-card border border-border/50 text-foreground"
            : "rounded-br-sm bg-primary text-primary-foreground"
        )}
      >
        <p className="leading-relaxed">{message.content}</p>
        <div
          className={cn(
            "mt-1 font-mono text-[9px]",
            isNoctis ? "text-muted-foreground/50" : "text-primary-foreground/60"
          )}
        >
          {message.timestamp.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}
        </div>
      </div>
    </div>
  );
};

export const ChatArea = ({ messages, isResponding, onSend }: ChatAreaProps) => {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesLength = messages.length;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesLength]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isResponding) return;
    onSend(trimmed);
    setInput("");
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-border/50 border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
            <img
              alt="FF15"
              className="h-5 w-5 object-contain"
              src="/favicons/favicon-32x32.png"
            />
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-[0.15em] text-foreground uppercase">
              Regalia Command Center
            </h1>
            <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60">
              Noctis Lucis Caelum — Direct Line
            </p>
          </div>
        </div>

        {isResponding && (
          <div className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1">
            <Radio
              className="h-3 w-3 text-primary"
              style={{ animation: "agent-glow 1s ease-in-out infinite" }}
            />
            <span className="animate-pulse font-mono text-[9px] font-semibold uppercase tracking-widest text-primary">
              Radio Incoming
            </span>
          </div>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1 px-4">
        <div className="space-y-4 py-4">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {isResponding && (
            <div className="flex items-end gap-2">
              <img
                alt="Noctis"
                src="/images/noctis.png"
                className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-primary/30"
              />
              <div className="rounded-xl rounded-bl-sm border border-border/50 bg-card px-3 py-2">
                <div className="flex items-center gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-1.5 w-1.5 rounded-full bg-primary/60"
                      style={{
                        animation: `agent-active 1s ease-in-out infinite`,
                        animationDelay: `${i * 0.2}s`,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="shrink-0 border-border/50 border-t p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            className={cn(
              "min-h-[40px] flex-1 resize-none rounded-lg border border-border/50 bg-muted/20 px-3 py-2",
              "text-sm text-foreground placeholder:text-muted-foreground/40",
              "ring-1 ring-border/50 transition-all",
              "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/50",
              "disabled:opacity-50"
            )}
            disabled={isResponding}
            maxLength={500}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a message to Noctis..."
            rows={1}
            value={input}
          />
          <Button
            className="shrink-0"
            disabled={!input.trim() || isResponding}
            onClick={handleSend}
            size="icon"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-1.5 font-mono text-[9px] text-muted-foreground/40">
          Press Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
};
