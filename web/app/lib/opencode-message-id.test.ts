import { describe, expect, it } from "vitest";
import { createOpencodeMessageId } from "./opencode-message-id";

describe("opencode-message-id", () => {
  it("creates IDs with the required msg prefix", () => {
    expect(createOpencodeMessageId()).toMatch(/^msg_/);
  });
});