import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import { ConfigPage } from "./route";

const TestPage = ConfigPage as unknown as (props: { loaderData: unknown }) => ReactNode;

describe("config route", () => {
  it("renders shared skills root under configuration fields", () => {
    const markup = renderToStaticMarkup(
      <TestPage
        loaderData={{
          config: {
            language: "en",
            sharedSkillsRoot: "skills",
          },
          settingsPath: "config/settings.yaml",
        }}
      />,
    );

    expect(markup).toContain("Shared Skills Root");
    expect(markup).toContain("skills");
  });
});