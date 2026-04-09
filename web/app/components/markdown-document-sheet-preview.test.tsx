import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/alert", () => ({
  Alert: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/sheet", () => ({
  SheetDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

import { MarkdownDocumentSheetPreview } from "./markdown-document-sheet-preview";

describe("markdown-document-sheet-preview", () => {
  it("renders metadata-only documents without the generic no-content placeholder", () => {
    const markup = renderToStaticMarkup(
      <MarkdownDocumentSheetPreview
        content=""
        displayMode="metadata-only"
        filePath="/tmp/news-run-plan.md"
        frontmatter={{
          title: "News run plan",
          change_name: "shared-frontmatter-document-preview",
          tags: ["planning"],
        }}
        previewLabel="Mission output"
        title="News run plan"
      />,
    );

    expect(markup).toContain("Document metadata");
    expect(markup).toContain("change_name");
    expect(markup).toContain("shared-frontmatter-document-preview");
    expect(markup).not.toContain("No content.");
  });
});