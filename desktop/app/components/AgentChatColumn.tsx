import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Crown, Moon } from "lucide-react";
import MessageCard from "@/components/MessageCard";
import type { ChatLogRecord, AgentId } from "@/lib/useAgentChatLog";
import type { CrystalMessage } from "@/routes/chat";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface AgentChatColumnProps {
  agent: AgentId;
  records: ChatLogRecord[];
  crystalMessages: CrystalMessage[];
  isWaiting: boolean;
  isActive: boolean;
  onActivate: () => void;
}

const AGENT_CONFIG = {
  noctis: {
    label: "Noctis",
    Icon: Crown,
    shortcut: "Ctrl+1",
    imageSrc: "/images/noctis.png",
  },
  lunafreya: {
    label: "Lunafreya",
    Icon: Moon,
    shortcut: "Ctrl+2",
    imageSrc: "/images/lunafreya.png",
  },
} as const;

type MergedItem =
  | { type: "agent"; record: ChatLogRecord }
  | { type: "crystal"; msg: CrystalMessage };

/**
 * Merge agent records and Crystal messages using positional interleaving.
 * Crystal messages are inserted at the index they were sent, independent of
 * timestamps (which can differ in timezone/format between the log and browser).
 *
 * Example with records [R0,R1,R2,R3] and crystal msgs sent at index 1 and 3:
 *   → [R0, C1, R1, R2, C2, R3]
 */
function mergeTimeline(
  records: ChatLogRecord[],
  crystalMessages: CrystalMessage[]
): MergedItem[] {
  // Sort crystal messages by the position in the record array when sent
  const sorted = [...crystalMessages].sort(
    (a, b) => a.recordIndexAtSend - b.recordIndexAtSend
  );

  const result: MergedItem[] = [];
  let cursor = 0;

  for (const msg of sorted) {
    // Emit all agent records that existed before this Crystal message
    while (cursor < msg.recordIndexAtSend && cursor < records.length) {
      result.push({ type: "agent", record: records[cursor] });
      cursor++;
    }
    result.push({ type: "crystal", msg });
  }

  // Emit any remaining agent records (responses that arrived after last send)
  while (cursor < records.length) {
    result.push({ type: "agent", record: records[cursor] });
    cursor++;
  }

  return result;
}

/** Crystal's message bubble (right-aligned). */
function CrystalBubble({ msg }: { msg: CrystalMessage }) {
  const ts = new Date(msg.ts);
  const timeStr = ts.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-muted-foreground/50">{timeStr}</span>
        <span className="text-[10px] font-semibold text-primary/80">Crystal</span>
      </div>
      <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary/20 border border-primary/30 px-3 py-2 text-xs leading-relaxed text-foreground/90 shadow-sm">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
          components={{
            img: () => null,
            a: ({ href, children }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 underline hover:text-blue-300"
              >
                {children}
              </a>
            ),
            code: ({ children }) => (
              <code className="bg-black/30 rounded px-1 font-mono text-[11px]">{children}</code>
            ),
          }}
        >
          {msg.content}
        </ReactMarkdown>
      </div>
    </div>
  );
}

/** Typing indicator — three bouncing dots. */
function TypingIndicator({ agentLabel }: { agentLabel: string }) {
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className="text-[10px] text-muted-foreground/50">{agentLabel}</span>
      <div className="rounded-2xl rounded-tl-sm bg-white/5 border border-border/30 px-3 py-2.5 flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="block h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce"
            style={{ animationDelay: `${i * 0.15}s`, animationDuration: "0.9s" }}
          />
        ))}
      </div>
    </div>
  );
}

export default function AgentChatColumn({
  agent,
  records,
  crystalMessages,
  isWaiting,
  isActive,
  onActivate,
}: AgentChatColumnProps) {
  const { label, Icon, imageSrc } = AGENT_CONFIG[agent];
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const [imgError, setImgError] = useState(false);

  const timeline = mergeTimeline(records, crystalMessages);

  // Track whether the user is at the bottom
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 32; // px tolerance
    isAtBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  };

  // Auto-follow new messages only if at bottom (task 4.1)
  useEffect(() => {
    if (!isAtBottomRef.current) return;
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [timeline.length, isWaiting]);

  const totalCount = records.length + crystalMessages.length;

  return (
    <div
      className={cn(
        "flex flex-col h-full rounded-lg border transition-all duration-150 overflow-hidden",
        isActive
          ? "border-primary/60 bg-primary/5 shadow-sm"
          : "border-border/40 bg-white/3"
      )}
    >
      {/* Column header (task 4.5 – click to activate) */}
      <button
        type="button"
        onClick={onActivate}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-t-lg border-b cursor-pointer transition-colors select-none",
          isActive
            ? "border-primary/40 bg-primary/10 text-primary"
            : "border-border/30 text-muted-foreground hover:text-foreground hover:bg-white/5"
        )}
      >
        {/* Character avatar image */}
        {!imgError ? (
          <img
            src={imageSrc}
            alt={label}
            onError={() => setImgError(true)}
            className="h-7 w-auto object-contain shrink-0"
          />
        ) : (
          <Icon
            className={cn(
              "h-4 w-4 shrink-0",
              isActive ? "text-primary" : "text-muted-foreground"
            )}
          />
        )}
        <span className="text-sm font-medium">{label}</span>
        <span className="ml-auto text-[10px] text-muted-foreground/60">
          {totalCount} msgs
        </span>
      </button>

      {/* Scrollable message list */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onClick={onActivate}
        className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3 cursor-pointer"
      >
        {timeline.length === 0 && !isWaiting ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground/60">
            No messages yet
          </div>
        ) : (
          <>
            {timeline.map((item) =>
              item.type === "crystal" ? (
                <CrystalBubble key={item.msg.id} msg={item.msg} />
              ) : (
                /* Agent message — left-aligned with label */
                <div key={item.record.id} className="flex flex-col items-start gap-0.5">
                  <span className="text-[10px] font-semibold text-muted-foreground/60 ml-1">
                    {label}
                  </span>
                  <div className="w-full">
                    <MessageCard record={item.record} />
                  </div>
                </div>
              )
            )}
            {/* Typing indicator */}
            {isWaiting && <TypingIndicator agentLabel={label} />}
          </>
        )}
      </div>
    </div>
  );
}
