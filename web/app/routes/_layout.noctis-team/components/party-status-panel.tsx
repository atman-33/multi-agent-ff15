import type { AgentStatus } from "./character-card";
import { CharacterCard } from "./character-card";

export interface PartyMember {
  id: string;
  name: string;
  role: string;
  imageSrc: string;
  status: AgentStatus;
  task: string;
  detail?: string;
  progress?: number;
}

interface PartyStatusPanelProps {
  members: PartyMember[];
}

export const PartyStatusPanel = ({ members }: PartyStatusPanelProps) => {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-border/50 border-b pb-2">
        <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Party Status
        </span>
        <div className="ml-auto font-mono text-[10px] text-muted-foreground/50">
          {members.filter((m) => m.status === "working").length} active
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
        {members.map((member) => (
          <CharacterCard key={member.id} {...member} />
        ))}
      </div>
    </div>
  );
};
