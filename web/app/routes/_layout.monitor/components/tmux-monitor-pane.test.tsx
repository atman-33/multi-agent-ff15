import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TmuxMonitorPaneCard } from "./tmux-monitor-pane";

describe("TmuxMonitorPaneCard", () => {
  it("renders ANSI color output as styled HTML instead of raw escape text", () => {
    const markup = renderToStaticMarkup(
      <TmuxMonitorPaneCard
        pane={{
          agentId: "noctis",
          content: "\u001b[38;2;255;0;0mRED\u001b[0m",
          paneIndex: 0,
          target: "ff15:main.0",
        }}
        status="busy"
      />,
    );

    expect(markup).toContain("RED");
    expect(markup).not.toContain("\u001b[38;2;255;0;0m");
    expect(markup).toContain("color:rgb");
  });

  it("keeps pane content inside a dual-axis scroll region", () => {
    const markup = renderToStaticMarkup(
      <TmuxMonitorPaneCard
        pane={{
          agentId: "ignis",
          content: "wide output",
          paneIndex: 1,
          target: "ff15:main.1",
        }}
        status="idle"
      />,
    );

    expect(markup).toContain("overflow-auto");
    expect(markup).toContain("min-w-max");
    expect(markup).toContain("whitespace-pre");
  });

  it("uses tight terminal spacing so the pane background does not show as horizontal stripes", () => {
    const markup = renderToStaticMarkup(
      <TmuxMonitorPaneCard
        pane={{
          agentId: "lunafreya",
          content: "line 1\nline 2",
          paneIndex: 4,
          target: "ff15:main.4",
        }}
        status="idle"
      />,
    );

    expect(markup).toContain("bg-[#0a0a0a]");
    expect(markup).toContain("px-2");
    expect(markup).toContain("py-2");
    expect(markup).toContain("leading-none");
  });
});