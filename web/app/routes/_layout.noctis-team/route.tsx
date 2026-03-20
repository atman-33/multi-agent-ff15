import { useCallback, useState } from "react";
import type { Route } from "./+types/route";
import type { AgentStatus } from "./components/character-card";
import type { BanterEntry } from "./components/banter-log";
import type { ChatMessage } from "./components/chat-area";
import type { PartyMember } from "./components/party-status-panel";
import { PartyStatusPanel } from "./components/party-status-panel";
import { BanterLog } from "./components/banter-log";
import { ChatArea } from "./components/chat-area";

const INITIAL_PARTY: PartyMember[] = [
  {
    id: "noctis",
    name: "Noctis",
    role: "Commander",
    imageSrc: "/images/noctis.png",
    status: "idle",
    task: "On the road",
  },
  {
    id: "ignis",
    name: "Ignis",
    role: "Analyst",
    imageSrc: "/images/ignis.png",
    status: "idle",
    task: "Awaiting orders",
  },
  {
    id: "gladio",
    name: "Gladio",
    role: "Executor",
    imageSrc: "/images/gladiolus.png",
    status: "idle",
    task: "Standing by",
  },
  {
    id: "prompto",
    name: "Prompto",
    role: "Reporter",
    imageSrc: "/images/prompto.png",
    status: "idle",
    task: "Monitoring feeds",
  },
];

const NOCTIS_RESPONSES = [
  "Leave it to the guys. Ignis is already on it.",
  "We've got this. Gladio, take point.",
  "Prompto, snap a few shots while you're at it.",
  "The road trip's hit a snag. Ignis, what's the play?",
  "On it. Everyone knows what to do.",
  "Alright. Let's keep moving forward.",
  "Sounds rough. We'll push through — always do.",
  "I'm not letting this slide. Gladio, you and me.",
];

const PARTY_BANTER: Array<{ speakerId: string; speakerName: string; speakerAvatar: string; message: string }> = [
  {
    speakerId: "ignis",
    speakerName: "Ignis",
    speakerAvatar: "/images/ignis.png",
    message: "I've been giving it some thought — analysis complete. Proceeding.",
  },
  {
    speakerId: "gladio",
    speakerName: "Gladio",
    speakerAvatar: "/images/gladiolus.png",
    message: "Quit stalling. I'll clear the path.",
  },
  {
    speakerId: "prompto",
    speakerName: "Prompto",
    speakerAvatar: "/images/prompto.png",
    message: "Got the recon data. Uploading now — oh, and I got some great shots.",
  },
  {
    speakerId: "ignis",
    speakerName: "Ignis",
    speakerAvatar: "/images/ignis.png",
    message: "Gladio, I'll need your report once you've finished your sweep.",
  },
  {
    speakerId: "gladio",
    speakerName: "Gladio",
    speakerAvatar: "/images/gladiolus.png",
    message: "Done. Prompto, you're up next.",
  },
];

const WORKING_BANTER: Array<{ speakerId: string; speakerName: string; speakerAvatar: string; message: string }> = [
  {
    speakerId: "ignis",
    speakerName: "Ignis",
    speakerAvatar: "/images/ignis.png",
    message: "Running analysis... this may take a moment.",
  },
  {
    speakerId: "gladio",
    speakerName: "Gladio",
    speakerAvatar: "/images/gladiolus.png",
    message: "Executing task. Don't get in my way.",
  },
  {
    speakerId: "prompto",
    speakerName: "Prompto",
    speakerAvatar: "/images/prompto.png",
    message: "On it! Gathering data as we speak.",
  },
];

const SUCCESS_BANTER: Array<{ speakerId: string; speakerName: string; speakerAvatar: string; message: string }> = [
  {
    speakerId: "ignis",
    speakerName: "Ignis",
    speakerAvatar: "/images/ignis.png",
    message: "Analysis complete. Results transmitted to Noctis.",
  },
  {
    speakerId: "gladio",
    speakerName: "Gladio",
    speakerAvatar: "/images/gladiolus.png",
    message: "Task done. Clean as a blade.",
  },
  {
    speakerId: "prompto",
    speakerName: "Prompto",
    speakerAvatar: "/images/prompto.png",
    message: "Report filed! And I got some sick photos too.",
  },
];

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "msg-1",
    role: "noctis",
    content: "We're on the road. What do you need?",
    timestamp: new Date(Date.now() - 300000),
  },
  {
    id: "msg-2",
    role: "user",
    content: "Noctis, what's the team's current status?",
    timestamp: new Date(Date.now() - 240000),
  },
  {
    id: "msg-3",
    role: "noctis",
    content:
      "Ignis has been going over the intel. Gladio's keeping watch. Prompto's… taking photos. The usual. We're ready when you are.",
    timestamp: new Date(Date.now() - 200000),
  },
];

const INITIAL_BANTER: BanterEntry[] = PARTY_BANTER.map((b, i) => ({
  ...b,
  id: `banter-init-${i}`,
  timestamp: new Date(Date.now() - (5 - i) * 60000),
}));

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const NoctisTeamPage = (_props: Route.ComponentProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [banterEntries, setBanterEntries] = useState<BanterEntry[]>(INITIAL_BANTER);
  const [partyMembers, setPartyMembers] = useState<PartyMember[]>(INITIAL_PARTY);
  const [isResponding, setIsResponding] = useState(false);

  const addBanterEntry = useCallback(
    (template: { speakerId: string; speakerName: string; speakerAvatar: string; message: string }) => {
      setBanterEntries((prev) => [
        ...prev,
        { ...template, id: createId(), timestamp: new Date() },
      ]);
    },
    []
  );

  const setAllMemberStatus = useCallback(
    (status: AgentStatus, task: string, noctisTask?: string) => {
      setPartyMembers((prev) =>
        prev.map((m) => ({
          ...m,
          status,
          task: m.id === "noctis" ? (noctisTask ?? task) : task,
        }))
      );
    },
    []
  );

  const handleSend = useCallback(
    (text: string) => {
      const userMessage: ChatMessage = {
        id: createId(),
        role: "user",
        content: text,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsResponding(true);
      setAllMemberStatus("working", "Processing request...", "Thinking...");

      const workingTemplate = WORKING_BANTER[Math.floor(Math.random() * WORKING_BANTER.length)];
      if (workingTemplate) {
        addBanterEntry(workingTemplate);
      }

      const responseDelay = 1800 + Math.random() * 1200;

      window.setTimeout(() => {
        const randomResponse =
          NOCTIS_RESPONSES[Math.floor(Math.random() * NOCTIS_RESPONSES.length)] ??
          NOCTIS_RESPONSES[0];

        const noctisMessage: ChatMessage = {
          id: createId(),
          role: "noctis",
          content: randomResponse ?? "",
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, noctisMessage]);
        setIsResponding(false);
        setAllMemberStatus("success", "Task complete", "Message sent");

        const successTemplate = SUCCESS_BANTER[Math.floor(Math.random() * SUCCESS_BANTER.length)];
        if (successTemplate) {
          addBanterEntry(successTemplate);
        }

        window.setTimeout(() => {
          setAllMemberStatus("idle", "Awaiting next order", "On the road");
        }, 2500);
      }, responseDelay);
    },
    [addBanterEntry, setAllMemberStatus]
  );

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
            isResponding={isResponding}
            messages={messages}
            onSend={handleSend}
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
