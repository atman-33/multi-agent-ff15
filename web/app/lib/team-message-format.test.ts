import { describe, expect, it } from "vitest";

import { buildTeamMessageEnvelope, parseRoutedMessageEnvelope } from "./team-message-format";

describe("team message envelopes", () => {
  it("builds and parses a routed report envelope", () => {
    const envelope = buildTeamMessageEnvelope({
      from: "ignis",
      to: "noctis",
      type: "report",
      body: "Mission complete",
      taskId: "task-42",
      reportStatus: "completed",
      artifacts: ["docs/report.md"],
      details: "All objectives met.",
    });

    expect(parseRoutedMessageEnvelope(envelope)).toEqual({
      speaker: "ignis",
      to: "noctis",
      messageType: "report",
      taskId: "task-42",
      status: "completed",
      summary: "Mission complete",
      details: "All objectives met.",
      artifacts: ["docs/report.md"],
    });
  });

  it("parses legacy envelopes and normalizes the gladio alias", () => {
    const legacyEnvelope = [
      "[TEAM_MESSAGE]",
      "from: Gladio",
      "to: Noctis",
      "kind: message",
      "task_id: task-7",
      "content:",
      "Hold the line.",
    ].join("\n");

    expect(parseRoutedMessageEnvelope(legacyEnvelope)).toEqual({
      speaker: "gladiolus",
      to: "noctis",
      messageType: "message",
      taskId: "task-7",
      body: "Hold the line.",
    });
  });
});
