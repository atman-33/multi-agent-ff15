import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getWebServerStatusMock } = vi.hoisted(() => ({
  getWebServerStatusMock: vi.fn(),
}));

vi.mock("@/lib/web-server", () => ({
  getWebServerStatus: getWebServerStatusMock,
}));

import { loader } from "./api.web-origin";

beforeEach(() => {
  getWebServerStatusMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("api.web-origin", () => {
  it("prefers FF15_WEB_ORIGIN over recorded runtime state", async () => {
    vi.stubEnv("FF15_WEB_ORIGIN", "http://127.0.0.1:13000");
    getWebServerStatusMock.mockResolvedValue({
      error: null,
      pid: 123,
      state: "running",
      url: "http://127.0.0.1:5173",
      warning: null,
    });

    const response = await loader();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      origin: "http://127.0.0.1:13000",
      source: "env",
    });
  });

  it("returns the recorded runtime origin when no env override is set", async () => {
    getWebServerStatusMock.mockResolvedValue({
      error: null,
      pid: 456,
      state: "running",
      url: "http://127.0.0.1:13000",
      warning: null,
    });

    const response = await loader();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      origin: "http://127.0.0.1:13000",
      source: "runtime",
    });
  });

  it("reports a 503 when no origin can be resolved", async () => {
    getWebServerStatusMock.mockResolvedValue({
      error: null,
      pid: null,
      state: "down",
      url: null,
      warning: null,
    });

    const response = await loader();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Web server origin is unavailable",
    });
  });
});
