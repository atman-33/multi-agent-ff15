import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Crown, Moon } from "lucide-react";
import MessageCard from "@/components/MessageCard";
import type { ChatLogRecord, AgentId } from "@/lib/useAgentChatLog";

interface AgentChatColumnProps {
  agent: AgentId;
  records: ChatLogRecord[];
  isActive: boolean;
  onActivate: () => void;
}

const AGENT_CONFIG = {
  noctis: {
    label: "Noctis",
    Icon: Crown,
    shortcut: "Ctrl+1",
  },
  lunafreya: {
    label: "Lunafreya",
    Icon: Moon,
    shortcut: "Ctrl+2",
  },
} as const;

export default function AgentChatColumn({
  agent,
  records,
  isActive,
  onActivate,
}: AgentChatColumnProps) {
  const { label, Icon } = AGENT_CONFIG[agent];
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

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
  }, [records]);

  return (
    <div
      className={cn(
        "flex flex-col h-full rounded-lg border transition-all duration-150",
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
        <Icon
          className={cn(
            "h-4 w-4 shrink-0",
            isActive ? "text-primary" : "text-muted-foreground"
          )}
        />
        <span className="text-sm font-medium">{label}</span>
        <span className="ml-auto text-[10px] text-muted-foreground/60">
          {records.length} 件
        </span>
      </button>

      {/* Scrollable message list (task 4.1 – independent scroll) */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-2 py-2 space-y-2"
      >
        {records.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground/60">
            メッセージなし
          </div>
        ) : (
          records.map((record) => (
            <MessageCard key={record.id} record={record} />
          ))
        )}
      </div>
    </div>
  );
}
