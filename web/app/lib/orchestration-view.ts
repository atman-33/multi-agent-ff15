export type OrchestrationSourceMessage = {
  info: {
    id: string;
    role: "user" | "assistant";
  };
  parts: Array<{
    type: string;
    text?: string;
    tool?: string;
    state?: {
      status?: string;
      error?: string;
    };
  }>;
};

export type SquadAgentId = "noctis" | "ignis" | "gladiolus" | "prompto";

export type SquadAgentState =
  | "idle"
  | "listening"
  | "delegating"
  | "analyzing"
  | "implementing"
  | "scanning"
  | "reporting"
  | "blocked"
  | "done";

export type SquadPresenceIntensity = "low" | "medium" | "high";

export type SquadPresence = {
  agentId: SquadAgentId;
  state: SquadAgentState;
  headline: string;
  detail: string;
  chatter: string[];
  taskLabel: string;
  intensity: SquadPresenceIntensity;
};

export type OrchestrationEventKind = "assignment" | "status" | "report" | "completion";

export type OrchestrationEventTone = "info" | "warning" | "success";

export type OrchestrationEvent = {
  id: string;
  actorId: SquadAgentId;
  kind: OrchestrationEventKind;
  title: string;
  detail: string;
  timeLabel: string;
  tone: OrchestrationEventTone;
};

export type OrchestrationViewModel = {
  commandDeckLabel: string;
  commandDeckSummary: string;
  commandDeckHint: string;
  presences: SquadPresence[];
  timeline: OrchestrationEvent[];
};

export const SQUAD_AGENT_META: Record<
  SquadAgentId,
  {
    name: string;
    role: string;
    imagePath: string;
    tintClass: string;
    borderClass: string;
    badgeClass: string;
    glowClass: string;
    dotClass: string;
  }
> = {
  noctis: {
    name: "Noctis",
    role: "King / Orchestrator",
    imagePath: "/images/noctis.png",
    tintClass: "from-sky-500/20 via-indigo-500/14 to-transparent",
    borderClass: "border-sky-400/25",
    badgeClass: "border-sky-400/25 bg-sky-500/10 text-sky-100",
    glowClass: "bg-sky-400/20",
    dotClass: "bg-sky-300",
  },
  ignis: {
    name: "Ignis",
    role: "Strategist / Analysis",
    imagePath: "/images/ignis.png",
    tintClass: "from-amber-500/18 via-yellow-500/12 to-transparent",
    borderClass: "border-amber-400/25",
    badgeClass: "border-amber-400/25 bg-amber-500/10 text-amber-100",
    glowClass: "bg-amber-400/20",
    dotClass: "bg-amber-300",
  },
  gladiolus: {
    name: "Gladiolus",
    role: "Shield / Implementation",
    imagePath: "/images/gladiolus.png",
    tintClass: "from-rose-500/18 via-red-500/12 to-transparent",
    borderClass: "border-rose-400/25",
    badgeClass: "border-rose-400/25 bg-rose-500/10 text-rose-100",
    glowClass: "bg-rose-400/20",
    dotClass: "bg-rose-300",
  },
  prompto: {
    name: "Prompto",
    role: "Scout / Recon",
    imagePath: "/images/prompto.png",
    tintClass: "from-yellow-400/20 via-amber-400/12 to-transparent",
    borderClass: "border-yellow-300/25",
    badgeClass: "border-yellow-300/25 bg-yellow-400/10 text-yellow-50",
    glowClass: "bg-yellow-300/20",
    dotClass: "bg-yellow-200",
  },
};

const INTERNAL_CONTEXT_REMOVE_REGEX = /<internal-context>[\s\S]*?<\/internal-context>/g;

const CHOICES: Record<SquadAgentId, Record<string, string[]>> = {
  noctis: {
    listening: [
      "Crystal has the floor. Holding the line for the next directive.",
      "Awaiting the next order before I split the work.",
    ],
    delegating: [
      "Split the brief. Keep the main thread clean.",
      "Prompto takes the sweep. Ignis takes the edges. Gladiolus holds the lane.",
    ],
    reporting: [
      "Condensing the squad chatter into one answer for Crystal.",
      "I have enough signal. Turning it into a clean response now.",
    ],
    done: [
      "Report delivered. The deck is quiet until the next order.",
      "Main thread updated. Standing by.",
    ],
  },
  ignis: {
    analyzing: [
      "Tracing constraints, edge cases, and hidden coupling.",
      "The interesting risk is rarely on the happy path.",
    ],
    done: [
      "Analysis stabilized. Handing the delta back to Noctis.",
      "The shape of the problem is clear now.",
    ],
    idle: [
      "Watching the board for the next strategic thread.",
      "No active puzzle. Ready to dissect the next one.",
    ],
  },
  gladiolus: {
    implementing: [
      "Holding the implementation lane and tightening the weak spots.",
      "If it moves into code, I want it robust on the first pass.",
    ],
    done: [
      "Implementation lane is stable. Waiting on the next call.",
      "The heavy lift is done. Keeping guard.",
    ],
    idle: [
      "No build pressure yet. Ready to take the hard path.",
      "Standing by to turn strategy into something durable.",
    ],
  },
  prompto: {
    scanning: [
      "Fast sweep in progress. Pulling likely hits first.",
      "I have candidates already. Narrowing down the useful ones.",
    ],
    done: [
      "Recon pass complete. Sending the clean list upstairs.",
      "The fast scan is done. Best leads are in.",
    ],
    idle: [
      "Quiet board. Ready for a fast search run.",
      "No sweep active. I'll jump when Noctis points.",
    ],
  },
};

function stripInternalContext(content: string): string {
  return content.replace(INTERNAL_CONTEXT_REMOVE_REGEX, "").trim();
}

function extractText(message: OrchestrationSourceMessage | null): string {
  if (!message) {
    return "";
  }

  return stripInternalContext(
    message.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text ?? "")
      .join("")
  );
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}...`;
}

function choose(items: string[], seed: number): string {
  if (items.length === 0) {
    return "";
  }

  return items[Math.abs(seed) % items.length] ?? items[0];
}

function lastMessageByRole(
  messages: OrchestrationSourceMessage[],
  role: "user" | "assistant"
): OrchestrationSourceMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.info.role === role) {
      return message;
    }
  }

  return null;
}

function makeEvent(
  id: string,
  actorId: SquadAgentId,
  kind: OrchestrationEventKind,
  title: string,
  detail: string,
  timeLabel: string,
  tone: OrchestrationEventTone
): OrchestrationEvent {
  return {
    id,
    actorId,
    kind,
    title,
    detail,
    timeLabel,
    tone,
  };
}

export function buildOrchestrationViewModel(options: {
  messages: OrchestrationSourceMessage[];
  streamingContent: string;
  isSessionRunning: boolean;
}): OrchestrationViewModel {
  const { isSessionRunning, messages, streamingContent } = options;
  const seed = messages.length + streamingContent.length;
  const lastUserText = truncate(extractText(lastMessageByRole(messages, "user")), 150);
  const lastAssistantText = truncate(extractText(lastMessageByRole(messages, "assistant")), 150);
  const latestDirective = lastUserText || "Awaiting Crystal's next directive.";
  const latestReport = lastAssistantText || "Noctis is holding the line for the next report.";

  if (isSessionRunning) {
    return {
      commandDeckLabel: "Crystal -> Noctis",
      commandDeckSummary: "Main Thread stays curated while the squad works in parallel.",
      commandDeckHint: streamingContent
        ? "Noctis is actively synthesizing squad output into a user-facing response."
        : "Noctis is coordinating the squad before speaking back into the main thread.",
      presences: [
        {
          agentId: "noctis",
          state: streamingContent ? "reporting" : "delegating",
          headline: streamingContent ? "Curating the squad response" : "Splitting the brief into lanes",
          detail: truncate(latestDirective, 86),
          chatter: [
            choose(
              CHOICES.noctis[streamingContent ? "reporting" : "delegating"] ?? [],
              seed
            ),
          ],
          taskLabel: streamingContent ? "Report synthesis" : "Delegation mesh",
          intensity: "high",
        },
        {
          agentId: "ignis",
          state: "analyzing",
          headline: "Tracing constraints and edge cases",
          detail: "Strategic analysis lane stays ahead of the final reply.",
          chatter: [choose(CHOICES.ignis.analyzing ?? [], seed + 1)],
          taskLabel: "Risk map",
          intensity: "medium",
        },
        {
          agentId: "gladiolus",
          state: "implementing",
          headline: "Holding the implementation lane",
          detail: "Preparing the robust path if this turns into concrete changes.",
          chatter: [choose(CHOICES.gladiolus.implementing ?? [], seed + 2)],
          taskLabel: "Execution lane",
          intensity: "medium",
        },
        {
          agentId: "prompto",
          state: "scanning",
          headline: "Running the fast sweep",
          detail: "Recon is surfacing likely files, routes, and quick hits.",
          chatter: [choose(CHOICES.prompto.scanning ?? [], seed + 3)],
          taskLabel: "Recon sweep",
          intensity: "medium",
        },
      ],
      timeline: [
        makeEvent(
          "evt-command",
          "noctis",
          "status",
          "Noctis received a fresh directive from Crystal",
          truncate(latestDirective, 110),
          "Live",
          "info"
        ),
        makeEvent(
          "evt-assign-prompto",
          "noctis",
          "assignment",
          "Prompto was assigned the fast recon lane",
          "Quick sweep of likely files and visible UI surfaces.",
          "Live",
          "info"
        ),
        makeEvent(
          "evt-assign-ignis",
          "ignis",
          "status",
          "Ignis is mapping constraints and edge cases",
          "Strategy and risk framing are kept separate from the main transcript.",
          "Live",
          "info"
        ),
        makeEvent(
          "evt-assign-gladio",
          "gladiolus",
          "status",
          "Gladiolus is holding the execution lane",
          "Implementation-ready thinking stays available without crowding Crystal.",
          "Live",
          "info"
        ),
        makeEvent(
          "evt-reporting",
          "noctis",
          "report",
          streamingContent ? "Noctis is synthesizing a curated reply" : "Noctis is preparing the next summary",
          streamingContent ? truncate(streamingContent, 110) : "Only the cleaned-up summary returns to the canonical thread.",
          "Now",
          "success"
        ),
      ],
    };
  }

  if (messages.length > 0) {
    return {
      commandDeckLabel: "Crystal -> Noctis",
      commandDeckSummary: "Crystal commands Noctis here. The squad remains visible as supporting context.",
      commandDeckHint: "The main thread shows only curated updates. Teammate chatter stays ambient in the stage.",
      presences: [
        {
          agentId: "noctis",
          state: lastAssistantText ? "done" : "listening",
          headline: lastAssistantText ? "Latest response is on deck" : "Awaiting the next order",
          detail: truncate(lastAssistantText || latestDirective, 86),
          chatter: [choose(CHOICES.noctis[lastAssistantText ? "done" : "listening"] ?? [], seed)],
          taskLabel: lastAssistantText ? "Report delivered" : "Command ready",
          intensity: lastAssistantText ? "medium" : "low",
        },
        {
          agentId: "ignis",
          state: lastAssistantText ? "done" : "idle",
          headline: lastAssistantText ? "Analysis folded into Noctis' reply" : "Watching for the next strategic thread",
          detail: "The strategy lane stays available without pulling focus from the command deck.",
          chatter: [choose(CHOICES.ignis[lastAssistantText ? "done" : "idle"] ?? [], seed + 1)],
          taskLabel: lastAssistantText ? "Analysis returned" : "Standby",
          intensity: "low",
        },
        {
          agentId: "gladiolus",
          state: lastAssistantText ? "done" : "idle",
          headline: lastAssistantText ? "Implementation lane stabilized" : "Standing by for the hard path",
          detail: "Heavy execution remains ready but secondary to the main thread until needed.",
          chatter: [choose(CHOICES.gladiolus[lastAssistantText ? "done" : "idle"] ?? [], seed + 2)],
          taskLabel: lastAssistantText ? "Execution stabilized" : "Standby",
          intensity: "low",
        },
        {
          agentId: "prompto",
          state: lastAssistantText ? "done" : "idle",
          headline: lastAssistantText ? "Recon packet already passed upstairs" : "No sweep active right now",
          detail: "Fast hits remain available as context, not as a competing transcript.",
          chatter: [choose(CHOICES.prompto[lastAssistantText ? "done" : "idle"] ?? [], seed + 3)],
          taskLabel: lastAssistantText ? "Recon complete" : "Standby",
          intensity: "low",
        },
      ],
      timeline: [
        makeEvent(
          "evt-idle-command",
          "noctis",
          "status",
          messages.length > 0 ? "Noctis has the latest directive on record" : "No active command yet",
          truncate(latestDirective, 110),
          "Recent",
          "info"
        ),
        makeEvent(
          "evt-idle-report",
          "noctis",
          lastAssistantText ? "report" : "status",
          lastAssistantText ? "Noctis delivered the latest curated response" : "The squad is idle but visible",
          truncate(latestReport, 110),
          lastAssistantText ? "Recent" : "Standby",
          lastAssistantText ? "success" : "info"
        ),
      ],
    };
  }

  return {
    commandDeckLabel: "Crystal -> Noctis",
    commandDeckSummary: "This deck is reserved for Crystal's directives and Noctis' curated replies.",
    commandDeckHint: "The squad stage stays visible even before work starts, so delegation never feels hidden.",
    presences: [
      {
        agentId: "noctis",
        state: "listening",
        headline: "Awaiting Crystal's first directive",
        detail: "Noctis holds the command deck and decides when to fan work out to the squad.",
        chatter: [choose(CHOICES.noctis.listening ?? [], 0)],
        taskLabel: "Command ready",
        intensity: "low",
      },
      {
        agentId: "ignis",
        state: "idle",
        headline: "Strategy lane is clear",
        detail: "Ignis becomes active when the brief needs structure, constraints, or risk framing.",
        chatter: [choose(CHOICES.ignis.idle ?? [], 1)],
        taskLabel: "Standby",
        intensity: "low",
      },
      {
        agentId: "gladiolus",
        state: "idle",
        headline: "Execution lane is clear",
        detail: "Gladiolus holds implementation readiness without crowding the main conversation.",
        chatter: [choose(CHOICES.gladiolus.idle ?? [], 2)],
        taskLabel: "Standby",
        intensity: "low",
      },
      {
        agentId: "prompto",
        state: "idle",
        headline: "Recon lane is clear",
        detail: "Prompto waits for a fast sweep request when Noctis wants quick signal first.",
        chatter: [choose(CHOICES.prompto.idle ?? [], 3)],
        taskLabel: "Standby",
        intensity: "low",
      },
    ],
    timeline: [
      makeEvent(
        "evt-empty",
        "noctis",
        "status",
        "The command deck is quiet",
        "Send the first directive to Noctis to wake the squad stage.",
        "Standby",
        "info"
      ),
    ],
  };
}