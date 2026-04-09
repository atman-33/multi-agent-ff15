import { describe, expect, it, vi } from "vitest";

const { globalEventMock } = vi.hoisted(() => ({
  globalEventMock: vi.fn(),
}));

vi.mock("@/lib/opencode-client", () => ({
  getOpencodeClient: () => ({
    global: {
      event: globalEventMock,
    },
  }),
}));

import { loader } from "./api.session.$id.events";

async function* createStream(events: unknown[]) {
  for (const event of events) {
    yield event;
  }
}

describe("api.session.$id.events", () => {
  it("streams matching raw session events", async () => {
    globalEventMock.mockResolvedValue({
      stream: createStream([
        {
          type: "session.status",
          properties: {
            sessionID: "session-1",
            status: { type: "busy" },
          },
        },
        {
          type: "session.status",
          properties: {
            sessionID: "session-2",
            status: { type: "busy" },
          },
        },
      ]),
    });

    const response = await loader({
      request: new Request("http://localhost/api/session/session-1/events"),
      params: { id: "session-1" },
    } as never);

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('"sessionID":"session-1"');
    expect(body).not.toContain('"sessionID":"session-2"');
  });

  it("preserves wrapped session events", async () => {
    globalEventMock.mockResolvedValue({
      stream: createStream([
        {
          payload: {
            type: "message.part.created",
            properties: {
              sessionID: "session-1",
              part: {
                type: "text",
                text: "Hello",
                sessionID: "session-1",
                messageID: "msg-1",
              },
            },
          },
        },
      ]),
    });

    const response = await loader({
      request: new Request("http://localhost/api/session/session-1/events"),
      params: { id: "session-1" },
    } as never);

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('"type":"message.part.created"');
    expect(body).toContain('"text":"Hello"');
  });
});