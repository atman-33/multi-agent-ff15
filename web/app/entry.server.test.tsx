import { describe, expect, it, vi } from "vitest";

const { ensureOpencodeServerMock, scheduleOpencodeModelCatalogRefreshMock } = vi.hoisted(() => ({
  ensureOpencodeServerMock: vi.fn(() => Promise.resolve("http://127.0.0.1:4097")),
  scheduleOpencodeModelCatalogRefreshMock: vi.fn(),
}));

vi.mock("./lib/opencode-server", () => ({
  ensureOpencodeServer: ensureOpencodeServerMock,
}));

vi.mock("./lib/opencode-model-catalog.server", () => ({
  scheduleOpencodeModelCatalogRefresh: scheduleOpencodeModelCatalogRefreshMock,
}));

describe("entry.server", () => {
  it("starts the opencode server and catalog refresh on import", async () => {
    vi.resetModules();

    await import("./entry.server");

    expect(ensureOpencodeServerMock).toHaveBeenCalledTimes(1);
    expect(scheduleOpencodeModelCatalogRefreshMock).toHaveBeenCalledTimes(1);
  });
});