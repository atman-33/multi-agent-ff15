import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/agent-theme", () => ({
  getAgentTheme: () => null,
}));

import { CharacterCard } from "./character-card";

describe("CharacterCard", () => {
  it("shows used remaining and limit in the tooltip", () => {
    const markup = renderToStaticMarkup(
      <CharacterCard
        agentId="noctis"
        contextUsage={{
          calculatedAt: "2026-04-11T00:00:00.000Z",
          limitTokens: 128000,
          modelID: "claude-haiku-4.5",
          providerID: "github-copilot",
          remainingPercentage: 0.75,
          remainingTokens: 96000,
          tokenBreakdown: {
            cacheRead: 8000,
            cacheWrite: 0,
            input: 24000,
            output: 1000,
            reasoning: 0,
            total: 33000,
          },
          usedPercentage: 0.25,
          usedTokens: 32000,
          windowTokens: 144000,
        }}
        detail="testing"
        imageSrc="/noctis.png"
        name="Noctis"
        role="status"
        status="working"
      />,
    );

    expect(markup).toContain("CTX budget");
    expect(markup).toContain("Used");
    expect(markup).toContain("32,000");
    expect(markup).toContain("Remaining");
    expect(markup).toContain("96,000");
    expect(markup).toContain("Limit");
    expect(markup).toContain("128,000");
    expect(markup).not.toContain("Window");
    expect(markup).not.toContain("144,000");
  });
});