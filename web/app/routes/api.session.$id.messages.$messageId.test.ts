import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  listSessionRequestAnchorsMock,
  resolveSessionRouteTargetMock,
  resolvedSessionMessagesMock,
  sessionMessagesMock,
} = vi.hoisted(() => ({
  listSessionRequestAnchorsMock: vi.fn(),
  resolveSessionRouteTargetMock: vi.fn(),
  resolvedSessionMessagesMock: vi.fn(),
  sessionMessagesMock: vi.fn(),
}));

vi.mock("@/lib/opencode-client", () => ({
  getOpencodeClient: () => ({
    session: {
      messages: sessionMessagesMock,
    },
  }),
}));

vi.mock("@/lib/session-owner-routing.server", () => ({
  resolveSessionRouteTarget: resolveSessionRouteTargetMock,
}));

vi.mock("@/lib/session-request-anchors.server", () => ({
  listSessionRequestAnchors: listSessionRequestAnchorsMock,
}));

import { loader } from "./api.session.$id.messages.$messageId";

describe("api.session.$id.messages.$messageId", () => {
  beforeEach(() => {
    resolveSessionRouteTargetMock.mockImplementation(() => ({
      client: {
        session: {
          messages: sessionMessagesMock,
        },
      },
      endpointUrl: null,
      managedSession: null,
      mode: "default",
      ownerAgent: null,
    }));
  });

  afterEach(() => {
    listSessionRequestAnchorsMock.mockReset();
    resolveSessionRouteTargetMock.mockReset();
    resolvedSessionMessagesMock.mockReset();
    sessionMessagesMock.mockReset();
  });

  it("loads managed session detail through the resolved owner-aware client", async () => {
    listSessionRequestAnchorsMock.mockReturnValue({});
    sessionMessagesMock.mockRejectedValue(new Error("default client should not be used"));
    resolvedSessionMessagesMock.mockResolvedValue({
      data: [
        {
          info: {
            id: "assistant-managed",
            role: "assistant",
            agent: "ignis",
            time: { created: Date.parse("2026-04-28T10:00:00.000Z") },
          },
          parts: [{ type: "text", text: "Managed detail body." }],
        },
      ],
    });
    resolveSessionRouteTargetMock.mockReturnValue({
      client: {
        session: {
          messages: resolvedSessionMessagesMock,
        },
      },
      endpointUrl: "http://127.0.0.1:4403",
      managedSession: {
        missionId: "mission-managed",
        ownerAgent: "ignis",
      },
      mode: "managed",
      ownerAgent: "ignis",
    });

    const response = await loader({
      params: { id: "session-managed", messageId: "assistant-managed" },
    } as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      message: expect.objectContaining({
        info: expect.objectContaining({ id: "assistant-managed" }),
      }),
    });
  });

  it("returns full message detail for on-demand transcript expansion", async () => {
    listSessionRequestAnchorsMock.mockReturnValue({});
    sessionMessagesMock.mockResolvedValue({
      data: [
        {
          info: {
            id: "assistant-1",
            role: "assistant",
            agent: "iris",
            providerID: "github-copilot",
            modelID: "gpt-5.4",
            time: { created: Date.parse("2026-04-26T10:00:00.000Z") },
          },
          summary: {
            content: "Summary body.",
            rawText: "Summary body.",
          },
          detailState: "summary",
          parts: [
            {
              type: "text",
              text: "Detailed body.",
            },
            {
              type: "tool",
              tool: "read_file",
              state: {
                status: "completed",
                input: { path: "README.md" },
                output: "done",
                error: "",
              },
            },
          ],
        },
      ],
    });

    const response = await loader({
      params: { id: "session-1", messageId: "assistant-1" },
    } as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(sessionMessagesMock).toHaveBeenCalledWith({ sessionID: "session-1" });
    expect(payload).toEqual({
      message: expect.objectContaining({
        detailState: "full",
        info: expect.objectContaining({ id: "assistant-1" }),
        parts: [
          {
            type: "text",
            text: "Detailed body.",
          },
          {
            type: "tool",
            tool: "read_file",
            state: {
              status: "completed",
              input: { path: "README.md" },
              output: "done",
              error: "",
            },
          },
        ],
      }),
    });
  });

  it("returns not found when the requested message is missing", async () => {
    listSessionRequestAnchorsMock.mockReturnValue({});
    sessionMessagesMock.mockResolvedValue({
      data: [
        {
          info: {
            id: "assistant-2",
            role: "assistant",
            agent: "iris",
            time: { created: Date.parse("2026-04-26T10:00:00.000Z") },
          },
          parts: [{ type: "text", text: "Other message." }],
        },
      ],
    });

    const response = await loader({
      params: { id: "session-1", messageId: "assistant-1" },
    } as never);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Message not found" });
  });
});