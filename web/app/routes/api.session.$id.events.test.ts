import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { globalEventMock, resolveSessionRouteTargetMock } = vi.hoisted(() => ({
  globalEventMock: vi.fn(),
  resolveSessionRouteTargetMock: vi.fn(),
}));

vi.mock("@/lib/opencode-client", () => ({
  getOpencodeClient: () => ({
    global: {
      event: globalEventMock,
    },
  }),
}));

vi.mock("@/lib/session-owner-routing.server", () => ({
  resolveSessionRouteTarget: resolveSessionRouteTargetMock,
}));

import { loader } from "./api.session.$id.events";

async function* createStream(events: unknown[]) {
  for (const event of events) {
    yield event;
  }
}

describe("api.session.$id.events", () => {
  beforeEach(() => {
    resolveSessionRouteTargetMock.mockImplementation(() => ({
      client: {
        global: {
          event: globalEventMock,
        },
      },
      endpointUrl: null,
      managedSession: null,
      mode: "default",
      ownedSession: null,
      ownerAgent: null,
    }));
  });

  afterEach(() => {
    globalEventMock.mockReset();
    resolveSessionRouteTargetMock.mockReset();
  });

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

  it("subscribes through the resolved owner client for managed sessions", async () => {
    const managedGlobalEventMock = vi.fn().mockResolvedValue({
      stream: createStream([
        {
          type: "session.status",
          properties: {
            sessionID: "session-managed",
            status: { type: "busy" },
          },
        },
      ]),
    });

    resolveSessionRouteTargetMock.mockReturnValue({
      client: {
        global: {
          event: managedGlobalEventMock,
        },
      },
      endpointUrl: "http://127.0.0.1:4401",
      managedSession: {
        missionId: "mission-1",
        ownerAgent: "noctis",
      },
      mode: "managed",
      ownerAgent: "noctis",
    });

    const response = await loader({
      request: new Request("http://localhost/api/session/session-managed/events"),
      params: { id: "session-managed" },
    } as never);

    expect(response.status).toBe(200);
    expect(resolveSessionRouteTargetMock).toHaveBeenCalledWith("session-managed");
    expect(managedGlobalEventMock).toHaveBeenCalledTimes(1);
    expect(globalEventMock).not.toHaveBeenCalled();
    const body = await response.text();
    expect(body).toContain('"sessionID":"session-managed"');
  });

  it("subscribes through the resolved owner client for owned Iris sessions", async () => {
    const ownedGlobalEventMock = vi.fn().mockResolvedValue({
      stream: createStream([
        {
          type: "session.status",
          properties: {
            sessionID: "session-iris",
            status: { type: "busy" },
          },
        },
      ]),
    });

    resolveSessionRouteTargetMock.mockReturnValue({
      client: {
        global: {
          event: ownedGlobalEventMock,
        },
      },
      endpointUrl: "http://127.0.0.1:4405",
      managedSession: null,
      mode: "owned",
      ownedSession: {
        ownerAgent: "iris",
        sessionTitle: "iris:projects",
        surface: "projects-iris",
        transportMode: "tmux-resident",
        updatedAt: "2026-04-30T00:00:00.000Z",
      },
      ownerAgent: "iris",
    });

    const response = await loader({
      request: new Request("http://localhost/api/session/session-iris/events"),
      params: { id: "session-iris" },
    } as never);

    expect(response.status).toBe(200);
    expect(resolveSessionRouteTargetMock).toHaveBeenCalledWith("session-iris");
    expect(ownedGlobalEventMock).toHaveBeenCalledTimes(1);
    expect(globalEventMock).not.toHaveBeenCalled();
    const body = await response.text();
    expect(body).toContain('"sessionID":"session-iris"');
  });
});