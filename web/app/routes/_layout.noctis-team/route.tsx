import type { Route } from "./+types/route";
import { PartyStatusPanel } from "./components/party-status-panel";
import { BanterLog } from "./components/banter-log";
import { ChatArea } from "./components/chat-area";
import { useAgentSession } from "@/hooks/use-agent-session";

const NoctisTeamPage = (_props: Route.ComponentProps) => {
  const { messages, banterEntries, partyMembers, isStreaming, send } = useAgentSession();

  return (
    <div className="relative flex h-full min-h-0 overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "url('/images/backgrounds/background-1.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center center",
          backgroundRepeat: "no-repeat",
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-background/80" />

      <div className="relative flex h-full min-h-0 w-full gap-0">
        <div className="flex min-h-0 flex-col overflow-hidden border-border/50 border-r" style={{ flex: "0 0 60%" }}>
          <ChatArea
            isResponding={isStreaming}
            messages={messages}
            onSend={send}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-hidden border-border/50 border-b p-3">
            <PartyStatusPanel members={partyMembers} />
          </div>

          <div className="min-h-0 flex-1 overflow-hidden p-3">
            <BanterLog entries={banterEntries} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default NoctisTeamPage;
