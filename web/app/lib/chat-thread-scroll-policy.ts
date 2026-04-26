import type { SessionChatScrollSignal } from "@/lib/session-chat-rendering-orchestration";

export function shouldAutoFollowThreadUpdate({
  nearBottom,
  scrollSignal,
}: {
  nearBottom: boolean;
  scrollSignal: SessionChatScrollSignal;
}): boolean {
  return nearBottom && scrollSignal !== "none";
}

export function getAutoFollowScrollBehavior(
  scrollSignal: SessionChatScrollSignal,
): ScrollBehavior {
  return scrollSignal === "streaming-growth" ? "auto" : "smooth";
}