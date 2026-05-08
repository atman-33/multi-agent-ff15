// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MessageDetailSheet from "./message-detail-sheet";

const testGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

vi.hoisted(() => {
  const maybeWindow = globalThis as typeof globalThis & {
    window?: typeof globalThis & { __vite_plugin_react_preamble_installed__?: boolean };
    __vite_plugin_react_preamble_installed__?: boolean;
    $RefreshReg$?: (type: unknown, id: string) => void;
    $RefreshSig$?: () => <T>(type: T) => T;
  };

  if (maybeWindow.window) {
    maybeWindow.window.__vite_plugin_react_preamble_installed__ = true;
  }
  maybeWindow.__vite_plugin_react_preamble_installed__ = true;
  maybeWindow.$RefreshReg$ = () => undefined;
  maybeWindow.$RefreshSig$ = () => (type) => type;
});

vi.mock("@/components/chat/session-message-detail-sheet", () => ({
  SessionMessageDetailSheet: ({ open }: { open: boolean }) => (
    <div data-message-detail-sheet={open ? "open" : "closed"} />
  ),
}));

describe("message-detail-sheet presence", () => {
  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    testGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }

    container.remove();
    testGlobal.IS_REACT_ACT_ENVIRONMENT = undefined;
  });

  it("stays mounted after closing once opened so the sheet can run its exit animation", async () => {
    await act(async () => {
      root?.render(
        <MessageDetailSheet
          content="Sliding detail."
          onOpenChange={() => undefined}
          open={true}
          sender="noctis"
        />,
      );
    });

    expect(container.innerHTML).toContain('data-message-detail-sheet="open"');

    await act(async () => {
      root?.render(
        <MessageDetailSheet
          content="Sliding detail."
          onOpenChange={() => undefined}
          open={false}
          sender="noctis"
        />,
      );
    });

    expect(container.innerHTML).toContain('data-message-detail-sheet="closed"');
  });
});
