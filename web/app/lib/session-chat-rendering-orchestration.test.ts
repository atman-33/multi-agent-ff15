import { describe, expect, it } from "vitest";
import type { MessageInfo } from "@/lib/opencode-session-types";
import {
  buildSessionChatRenderSnapshot,
  type SessionChatRefreshKind,
} from "./session-chat-rendering-orchestration";
import type { SessionPresentationMessage } from "./session-message-presentation";
import { toSessionPresentationMessages } from "./session-message-presentation";

function createGroupedNoctisMessages(): SessionPresentationMessage[] {
  return [
    {
      id: "tool-1",
      role: "assistant",
      sender: "noctis",
      senderLabel: "Noctis",
      kind: "assistant_message",
      content: "",
      detailContent: "",
      rawText: "",
      parts: [{ type: "tool", tool: "bash", state: { status: "completed" } }],
      timestamp: new Date("2026-04-04T10:00:00.000Z"),
      source: "session",
    },
    {
      id: "reply-1",
      role: "assistant",
      sender: "noctis",
      senderLabel: "Noctis",
      kind: "assistant_message",
      content: "了解。今、みんなに聞いている。",
      detailContent: "了解。今、みんなに聞いている。",
      rawText: "了解。今、みんなに聞いている。",
      parts: [{ type: "text", text: "了解。今、みんなに聞いている。" }],
      timestamp: new Date("2026-04-04T10:00:05.000Z"),
      source: "session",
    },
  ];
}

function createStableUserMessages(): SessionPresentationMessage[] {
  return [
    {
      id: "user-1",
      role: "user",
      sender: "user",
      senderLabel: "User",
      kind: "user_message",
      content: "Status?",
      detailContent: "Status?",
      rawText: "Status?",
      parts: [{ type: "text", text: "Status?" }],
      timestamp: new Date("2026-04-04T10:00:00.000Z"),
      source: "session",
    },
  ];
}

function expectRefreshKind(actual: SessionChatRefreshKind, expected: SessionChatRefreshKind) {
  expect(actual).toBe(expected);
}

describe("session-chat-rendering-orchestration", () => {
  it("classifies unchanged refresh as noop and reuses unchanged rendered message references", () => {
    const initial = buildSessionChatRenderSnapshot({
      messages: createStableUserMessages(),
    });

    const refreshed = buildSessionChatRenderSnapshot({
      messages: createStableUserMessages(),
      previousSnapshot: initial,
    });

    expectRefreshKind(initial.refreshKind, "initial");
    expectRefreshKind(refreshed.refreshKind, "noop");
    expect(refreshed.renderedMessages).toHaveLength(1);
    expect(refreshed.renderedMessages[0]).toBe(initial.renderedMessages[0]);
    expect(refreshed.inspectabilityBoundaries[0]).toEqual(initial.inspectabilityBoundaries[0]);
    expect(refreshed.scrollSignal).toBe("none");
  });

  it("classifies a new tail conversation unit as tail append", () => {
    const initial = buildSessionChatRenderSnapshot({
      messages: createStableUserMessages(),
    });

    const appended = buildSessionChatRenderSnapshot({
      messages: [
        ...createStableUserMessages(),
        {
          id: "reply-2",
          role: "assistant",
          sender: "noctis",
          senderLabel: "Noctis",
          kind: "assistant_message",
          content: "All clear.",
          detailContent: "All clear.",
          rawText: "All clear.",
          parts: [{ type: "text", text: "All clear." }],
          timestamp: new Date("2026-04-04T10:00:05.000Z"),
          source: "session",
        },
      ],
      previousSnapshot: initial,
    });

    expectRefreshKind(appended.refreshKind, "tail-append");
    expect(appended.scrollSignal).toBe("tail-append");
    expect(appended.renderedMessages).toHaveLength(2);
    expect(appended.renderedMessages[0]).toBe(initial.renderedMessages[0]);
  });

  it("keeps opencode and noctis adapters aligned on the same orchestration contract", () => {
    const rawPrompt = `
<operation-prompt>
<instruction>
Follow the handoff.
</instruction>

<worker-report from="ignis" to="noctis">
Implemented the requested change.
</worker-report>
</operation-prompt>
    `.trim();

    const opencodeMessages: MessageInfo[] = [
      {
        info: {
          id: "worker-1",
          role: "user",
          agent: "noctis",
          time: { created: Date.parse("2026-04-04T10:00:00.000Z") },
        },
        parts: [{ type: "text", text: rawPrompt }],
      },
    ];
    const noctisMessages: SessionPresentationMessage[] = [
      {
        id: "worker-1",
        role: "assistant",
        sender: "ignis",
        senderLabel: "Ignis",
        kind: "team_message",
        content: "Implemented the requested change.",
        detailContent: "Implemented the requested change.",
        rawText: rawPrompt,
        parts: [{ type: "text", text: rawPrompt }],
        timestamp: new Date("2026-04-04T10:00:00.000Z"),
        source: "session",
      },
    ];

    const opencodeSnapshot = buildSessionChatRenderSnapshot({
      messages: toSessionPresentationMessages(opencodeMessages),
    });
    const noctisSnapshot = buildSessionChatRenderSnapshot({
      messages: noctisMessages,
    });

    expect(opencodeSnapshot.refreshKind).toBe("initial");
    expect(noctisSnapshot.refreshKind).toBe("initial");
    expect(opencodeSnapshot.renderedMessages[0]?.conversationUnitId).toBe(
      noctisSnapshot.renderedMessages[0]?.conversationUnitId,
    );
    expect(opencodeSnapshot.renderedMessages[0]?.messageDisplay.displayContent).toBe(
      noctisSnapshot.renderedMessages[0]?.messageDisplay.displayContent,
    );
    expect(opencodeSnapshot.inspectabilityBoundaries[0]).toEqual(
      noctisSnapshot.inspectabilityBoundaries[0],
    );
  });

  it("classifies streaming content growth as a follow-worthy tail update", () => {
    const initial = buildSessionChatRenderSnapshot({
      messages: [],
      streamingText: {
        content: "Hel",
        fallbackSender: null,
        fallbackSenderLabel: "Assistant",
      },
    });

    const updated = buildSessionChatRenderSnapshot({
      messages: [],
      previousSnapshot: initial,
      streamingText: {
        content: "Hello",
        fallbackSender: null,
        fallbackSenderLabel: "Assistant",
      },
    });

    expectRefreshKind(updated.refreshKind, "streaming-growth");
    expect(updated.scrollSignal).toBe("streaming-growth");
    expect(updated.streamingMessage?.messageDisplay.displayContent).toBe("Hello");
  });

  it("builds a temporary streaming message from a live draft with intermediate details", () => {
    const snapshot = buildSessionChatRenderSnapshot({
      liveDraft: {
        fallbackSender: null,
        fallbackSenderLabel: "Assistant",
        messageId: "assistant-1",
        parts: [{ text: "Thinking through the next step", type: "reasoning" }],
      },
      messages: [],
    });

    expect(snapshot.streamingMessage?.conversationUnitId).toBe("assistant-1");
    expect(snapshot.streamingMessage?.messageDisplay.displayContent).toBe("");
    expect(snapshot.streamingMessage?.parts).toEqual([
      { text: "Thinking through the next step", type: "reasoning" },
    ]);
  });

  it("suppresses a workflow user-request live draft instead of rendering a duplicate temporary user bubble", () => {
    const userPrompt = "調査用 ping 1778290088554";
    const rawPrompt = `
<operation-prompt>
<workspace-context>
project_root: /tmp/example
</workspace-context>

<tooling-context>
activate_project: /tmp/example
</tooling-context>

<user-request from="user" to="noctis">
${userPrompt}
</user-request>
</operation-prompt>
    `.trim();

    const snapshot = buildSessionChatRenderSnapshot({
      liveDraft: {
        fallbackSender: "noctis",
        fallbackSenderLabel: "Noctis",
        messageId: "assistant-1",
        parts: [{ text: rawPrompt, type: "text" }],
      },
      messages: [
        {
          id: "user-1",
          role: "user",
          sender: "user",
          senderLabel: "User",
          kind: "user_message",
          content: userPrompt,
          detailContent: userPrompt,
          rawText: userPrompt,
          parts: [{ type: "text", text: userPrompt }],
          timestamp: new Date("2026-05-09T10:29:00.000Z"),
          source: "session",
        },
      ],
      streamingText: {
        content: rawPrompt,
        fallbackSender: "noctis",
        fallbackSenderLabel: "Noctis",
      },
    });

    expect(snapshot.renderedMessages).toHaveLength(1);
    expect(snapshot.renderedMessages[0]?.messageDisplay.displayContent).toBe(userPrompt);
    expect(snapshot.streamingMessage).toBeNull();
  });

  it("reuses the tail Noctis intermediate bubble instead of rendering a second live Noctis bubble", () => {
    const snapshot = buildSessionChatRenderSnapshot({
      liveDraft: {
        fallbackSender: "noctis",
        fallbackSenderLabel: "Noctis",
        messageId: "reply-2",
        parts: [{ text: "了解。俺がイグニス、グラディオラス、プロンプトに今それぞれ聞いておいた。", type: "text" }],
      },
      messages: [
        {
          id: "tool-1",
          role: "assistant",
          sender: "noctis",
          senderLabel: "Noctis",
          kind: "assistant_message",
          content: "",
          detailContent: "",
          rawText: "",
          parts: [{ type: "tool", tool: "bash", state: { status: "completed" } }],
          timestamp: new Date("2026-04-04T10:00:00.000Z"),
          source: "session",
        },
      ],
    });

    expect(snapshot.renderedMessages).toHaveLength(1);
    expect(snapshot.streamingMessage).toBeNull();
    expect(snapshot.renderedMessages[0]?.conversationUnitId).toBe("tool-1");
    expect(snapshot.renderedMessages[0]?.messageDisplay.displayContent).toBe(
      "了解。俺がイグニス、グラディオラス、プロンプトに今それぞれ聞いておいた。",
    );
    expect(snapshot.renderedMessages[0]?.parts.filter((part) => part.type === "tool")).toHaveLength(1);
    expect(snapshot.renderedMessages[0]?.parts.filter((part) => part.type === "text")).toHaveLength(1);
  });

  it("reuses the tail Iris intermediate bubble instead of rendering a second live Iris bubble when configured as the continuity assistant", () => {
    const snapshot = buildSessionChatRenderSnapshot({
      continuityAssistant: {
        sender: "iris",
        senderLabel: "Iris",
      },
      liveDraft: {
        fallbackSender: "iris",
        fallbackSenderLabel: "Iris",
        messageId: "reply-2",
        parts: [{ text: "Registry refreshed.", type: "text" }],
      },
      messages: [
        {
          id: "tool-1",
          role: "assistant",
          sender: "iris",
          senderLabel: "Iris",
          kind: "assistant_message",
          content: "",
          detailContent: "",
          rawText: "",
          parts: [{ type: "tool", tool: "bash", state: { status: "completed" } }],
          timestamp: new Date("2026-04-25T09:00:00.000Z"),
          source: "session",
        },
      ],
    });

    expect(snapshot.renderedMessages).toHaveLength(1);
    expect(snapshot.streamingMessage).toBeNull();
    expect(snapshot.renderedMessages[0]?.conversationUnitId).toBe("tool-1");
    expect(snapshot.renderedMessages[0]?.senderLabel).toBe("Iris");
    expect(snapshot.renderedMessages[0]?.messageDisplay.displayContent).toBe("Registry refreshed.");
  });

  it("suppresses the live tail when authoritative history already contains the current streaming message", () => {
    const snapshot = buildSessionChatRenderSnapshot({
      currentStreamingMessageId: "assistant-1",
      liveDraft: {
        fallbackSender: "iris",
        fallbackSenderLabel: "Iris",
        messageId: "assistant-1",
        parts: [{ text: "Registry refreshed.", type: "text" }],
      },
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          sender: "iris",
          senderLabel: "Iris",
          kind: "assistant_message",
          content: "Registry refreshed.",
          detailContent: "Registry refreshed.",
          rawText: "Registry refreshed.",
          parts: [{ type: "text", text: "Registry refreshed." }],
          timestamp: new Date("2026-04-25T09:00:00.000Z"),
          source: "session",
        },
      ],
    });

    expect(snapshot.renderedMessages).toHaveLength(1);
    expect(snapshot.renderedMessages[0]?.conversationUnitId).toBe("assistant-1");
    expect(snapshot.streamingMessage).toBeNull();
  });

  it("exposes a pending indicator state when an assistant is active without visible tail content", () => {
    const snapshot = buildSessionChatRenderSnapshot({
      assistantPending: true,
      messages: [],
    });

    expect(snapshot.showPendingIndicator).toBe(true);
    expect(snapshot.streamingMessage).toBeNull();
  });

  it("keeps the pending indicator visible while assistant work is still in flight", () => {
    const draftSnapshot = buildSessionChatRenderSnapshot({
      assistantPending: true,
      liveDraft: {
        fallbackSender: null,
        fallbackSenderLabel: "Assistant",
        messageId: "assistant-1",
        parts: [{ text: "Thinking through the next step", type: "reasoning" }],
      },
      messages: [],
    });
    const textSnapshot = buildSessionChatRenderSnapshot({
      assistantPending: true,
      messages: [],
      streamingText: {
        content: "Visible reply",
        fallbackSender: null,
        fallbackSenderLabel: "Assistant",
      },
    });

    expect(draftSnapshot.streamingMessage).not.toBeNull();
    expect(draftSnapshot.showPendingIndicator).toBe(true);
    expect(textSnapshot.streamingMessage?.messageDisplay.displayContent).toBe("Visible reply");
    expect(textSnapshot.showPendingIndicator).toBe(true);
  });

  it("replaces a pending-only tail with authoritative assistant history without leaving duplicate tail state", () => {
    const pendingSnapshot = buildSessionChatRenderSnapshot({
      assistantPending: true,
      messages: [],
    });

    const settledSnapshot = buildSessionChatRenderSnapshot({
      assistantPending: false,
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          sender: "noctis",
          senderLabel: "Noctis",
          kind: "assistant_message",
          content: "Mission reply settled.",
          detailContent: "Mission reply settled.",
          rawText: "Mission reply settled.",
          parts: [{ type: "text", text: "Mission reply settled." }],
          timestamp: new Date("2026-04-28T10:00:05.000Z"),
          source: "session",
        },
      ],
      previousSnapshot: pendingSnapshot,
    });

    expect(pendingSnapshot.showPendingIndicator).toBe(true);
    expect(settledSnapshot.showPendingIndicator).toBe(false);
    expect(settledSnapshot.streamingMessage).toBeNull();
    expect(settledSnapshot.renderedMessages).toHaveLength(1);
    expect(settledSnapshot.renderedMessages[0]?.messageDisplay.displayContent).toBe(
      "Mission reply settled.",
    );
    expectRefreshKind(settledSnapshot.refreshKind, "tail-append");
  });

  it("derives follow keys from reasoning-only live draft growth", () => {
    const initial = buildSessionChatRenderSnapshot({
      liveDraft: {
        fallbackSender: null,
        fallbackSenderLabel: "Assistant",
        messageId: "assistant-1",
        parts: [{ text: "Thinking", type: "reasoning" }],
      },
      messages: [],
    });

    const updated = buildSessionChatRenderSnapshot({
      liveDraft: {
        fallbackSender: null,
        fallbackSenderLabel: "Assistant",
        messageId: "assistant-1",
        parts: [{ text: "Thinking through the next step", type: "reasoning" }],
      },
      messages: [],
      previousSnapshot: initial,
    });

    expectRefreshKind(updated.refreshKind, "streaming-growth");
    expect(updated.scrollSignal).toBe("streaming-growth");
    expect(updated.autoFollowKey).not.toBe(initial.autoFollowKey);
    expect(updated.streamingMessage?.detailRawText).toContain("Thinking through the next step");
  });

  it("reuses confirmed transcript arrays when only the live tail changes", () => {
    const messages = createGroupedNoctisMessages();
    const continuityAssistant = {
      sender: "noctis" as const,
      senderLabel: "Noctis",
    };
    const initial = buildSessionChatRenderSnapshot({
      continuityAssistant,
      messages,
    });

    const updated = buildSessionChatRenderSnapshot({
      continuityAssistant,
      liveDraft: {
        fallbackSender: "iris",
        fallbackSenderLabel: "Iris",
        messageId: "assistant-2",
        parts: [{ text: "Streaming update", type: "text" }],
      },
      messages,
      previousSnapshot: initial,
    });

    expect(updated.renderedMessages).toBe(initial.renderedMessages);
    expect(updated.inspectabilityBoundaries).toBe(initial.inspectabilityBoundaries);
    expect(updated.renderedMessages[0]).toBe(initial.renderedMessages[0]);
    expect(updated.streamingMessage?.messageDisplay.displayContent).toBe("Streaming update");
  });
});