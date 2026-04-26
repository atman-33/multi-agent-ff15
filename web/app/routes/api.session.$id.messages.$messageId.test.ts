import { afterEach, describe, expect, it, vi } from "vitest";

const { listSessionRequestAnchorsMock, sessionMessagesMock } = vi.hoisted(() => ({
  listSessionRequestAnchorsMock: vi.fn(),
  sessionMessagesMock: vi.fn(),
}));

vi.mock("@/lib/opencode-client", () => ({
  getOpencodeClient: () => ({
    session: {
      messages: sessionMessagesMock,
    },
  }),
}));

vi.mock("@/lib/session-request-anchors.server", () => ({
  listSessionRequestAnchors: listSessionRequestAnchorsMock,
}));

import { loader } from "./api.session.$id.messages.$messageId";

describe("api.session.$id.messages.$messageId", () => {
  afterEach(() => {
    listSessionRequestAnchorsMock.mockReset();
    sessionMessagesMock.mockReset();
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