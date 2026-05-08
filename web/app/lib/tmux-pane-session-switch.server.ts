import { spawnSync } from "node:child_process";

import { getProjectRoot } from "@/lib/get-project-root.server";
import type { AgentId } from "@/lib/types/mission";

const TMUX_SESSION_NAME = "ff15";
const TMUX_INTERACTION_DELAY_SECONDS = "0.5";

const TMUX_AGENT_PANE_INDEX: Record<AgentId | "iris", number> = {
  noctis: 0,
  ignis: 1,
  gladiolus: 2,
  prompto: 3,
  lunafreya: 4,
  iris: 5,
};

function runTmux(root: string, args: string[]): void {
  const result = spawnSync("tmux", args, {
    cwd: root,
    encoding: "utf-8",
  });

  if ((result.status ?? 1) !== 0) {
    throw new Error(result.stderr || `Failed to run tmux ${args.join(" ")}`);
  }
}

function waitForTmuxInteraction(root: string): void {
  const result = spawnSync("sleep", [TMUX_INTERACTION_DELAY_SECONDS], {
    cwd: root,
    encoding: "utf-8",
  });

  if ((result.status ?? 1) !== 0) {
    throw new Error(
      result.stderr ?? `Failed to wait ${TMUX_INTERACTION_DELAY_SECONDS}s between tmux inputs`
    );
  }
}

function sendTmuxKeys(
  root: string,
  target: string,
  args: string[],
  hasSentInput: { current: boolean }
): void {
  if (hasSentInput.current) {
    waitForTmuxInteraction(root);
  }

  runTmux(root, ["send-keys", "-t", target, ...args]);
  hasSentInput.current = true;
}

export function getTmuxPaneTargetForAgent(agentId: AgentId): string {
  return `${TMUX_SESSION_NAME}:main.${TMUX_AGENT_PANE_INDEX[agentId]}`;
}

export function switchTmuxPaneSession(input: {
  agentId: AgentId;
  root?: string;
  sessionTitle: string;
}): void {
  const root = input.root ?? getProjectRoot();
  const target = getTmuxPaneTargetForAgent(input.agentId);
  const hasSentInput = { current: false };

  sendTmuxKeys(root, target, ["C-p"], hasSentInput);
  sendTmuxKeys(root, target, ["-l", "Switch session"], hasSentInput);
  sendTmuxKeys(root, target, ["Enter"], hasSentInput);
  sendTmuxKeys(root, target, ["-l", input.sessionTitle], hasSentInput);
  sendTmuxKeys(root, target, ["Enter"], hasSentInput);
}
