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
      next: "COMPLETE",
      reportStatus: "completed",
      artifacts: ["docs/report.md"],
    });

    expect(parseRoutedMessageEnvelope(envelope)).toEqual({
      speaker: "ignis",
      to: "noctis",
      messageType: "report",
      taskId: "task-42",
      next: "COMPLETE",
      status: "completed",
      body: "Mission complete",
      summary: undefined,
      details: undefined,
      artifacts: ["docs/report.md"],
    });
  });

  it("round-trips next in routed report envelopes", () => {
    const envelope = buildTeamMessageEnvelope({
      from: "gladiolus",
      to: "noctis",
      type: "report",
      body: "Implementation complete",
      taskId: "task-99",
      next: "refactor",
      reportStatus: "completed",
    });

    expect(parseRoutedMessageEnvelope(envelope)).toEqual({
      speaker: "gladiolus",
      to: "noctis",
      messageType: "report",
      taskId: "task-99",
      next: "refactor",
      status: "completed",
      body: "Implementation complete",
      summary: undefined,
      details: undefined,
      artifacts: undefined,
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
