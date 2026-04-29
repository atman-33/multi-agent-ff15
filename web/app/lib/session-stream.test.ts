import { describe, expect, it } from "vitest";
import { mergeSessionLiveDraft, parseSessionLiveEvent } from "./session-stream";

describe("parseSessionLiveEvent", () => {
  it("normalizes a reasoning part update", () => {
    expect(
      parseSessionLiveEvent({
        type: "message.part.updated",
        properties: {
          part: {
            id: "part-1",
            messageID: "message-1",
            sessionID: "session-1",
            text: "Considering project specifications",
            time: {
              start: 1,
            },
            type: "reasoning",
          },
        },
      }),
    ).toEqual({
      kind: "part",
      messageId: "message-1",
      part: {
        text: "Considering project specifications",
        type: "reasoning",
      },
      sessionId: "session-1",
    });
  });

  it("normalizes a tool part update", () => {
    expect(
      parseSessionLiveEvent({
        type: "message.part.updated",
        properties: {
          part: {
            callID: "call-1",
            id: "part-2",
            messageID: "message-1",
            sessionID: "session-1",
            state: {
              input: { filePath: "README.md" },
              output: "ok",
              status: "completed",
            },
            tool: "read_file",
            type: "tool",
          },
        },
      }),
    ).toEqual({
      kind: "part",
      messageId: "message-1",
      part: {
        state: {
          input: { filePath: "README.md" },
          output: "ok",
          status: "completed",
        },
        tool: "read_file",
        type: "tool",
      },
      sessionId: "session-1",
    });
  });

  it("normalizes a session status event", () => {
    expect(
      parseSessionLiveEvent({
        type: "session.status",
        properties: {
          sessionID: "session-1",
          status: {
            type: "retry",
          },
        },
      }),
    ).toEqual({
      kind: "status",
      sessionId: "session-1",
      status: "retry",
    });
  });

  it("normalizes a session idle event", () => {
    expect(
      parseSessionLiveEvent({
        type: "session.idle",
        properties: {
          sessionID: "session-1",
        },
      }),
    ).toEqual({
      kind: "idle",
      sessionId: "session-1",
    });
  });

  it("appends a reasoning part onto an existing live draft", () => {
    expect(
      mergeSessionLiveDraft(
        {
          messageId: "message-1",
          parts: [{ type: "text", text: "Drafting the next reply" }],
          sessionId: "session-1",
        },
        {
          kind: "part",
          messageId: "message-1",
          part: { type: "reasoning", text: "Thinking through the next step" },
          sessionId: "session-1",
        },
      ),
    ).toEqual({
      messageId: "message-1",
      parts: [
        { type: "text", text: "Drafting the next reply" },
        { type: "reasoning", text: "Thinking through the next step" },
      ],
      sessionId: "session-1",
    });
  });
});