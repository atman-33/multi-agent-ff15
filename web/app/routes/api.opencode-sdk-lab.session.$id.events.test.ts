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

import { loader } from "./api.opencode-sdk-lab.session.$id.events";

async function* createStream(events: unknown[]) {
  for (const event of events) {
    yield event;
  }
}

describe("api.opencode-sdk-lab.session.$id.events", () => {
  it("streams only matching session events", async () => {
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
      request: new Request("http://localhost/api/opencode-sdk-lab/session/session-1/events"),
      params: { id: "session-1" },
    } as never);

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('"sessionID":"session-1"');
    expect(body).not.toContain('"sessionID":"session-2"');
  });

  it("preserves wrapped message part events", async () => {
    globalEventMock.mockResolvedValue({
      stream: createStream([
        {
          payload: {
            type: "message.part.created",
            properties: {
              part: {
                messageID: "msg-1",
                sessionID: "session-1",
                text: "hello",
                type: "text",
              },
            },
          },
        },
      ]),
    });

    const response = await loader({
      request: new Request("http://localhost/api/opencode-sdk-lab/session/session-1/events"),
      params: { id: "session-1" },
    } as never);

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('"type":"message.part.created"');
    expect(body).toContain('"text":"hello"');
  });
});