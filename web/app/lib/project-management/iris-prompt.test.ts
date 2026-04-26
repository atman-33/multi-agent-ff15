import { describe, expect, it } from "vitest";
import type { PromptPart } from "@/lib/prompt-parts";
import { buildProjectIrisContextText, prependProjectIrisContext } from "./iris-prompt";

describe("project-management iris-prompt", () => {
  it("builds a simple Projects Iris context block", () => {
    expect(
      buildProjectIrisContextText({
        helperText: "Register, rename, refresh, or delete projects by chatting with Iris.",
      }),
    ).toContain("projects-iris-context");
  });

  it("prepends project management context and the pinned skill reference before a user-request-wrapped send", () => {
    const parts: PromptPart[] = [
      { type: "file", path: "/home/atman/repos/client-x/AGENTS.md" },
      { type: "text", text: "Register /home/atman/repos/client-x" },
    ];

    expect(
      prependProjectIrisContext(
        {
          helperText: "Register, rename, refresh, or delete projects by chatting with Iris.",
          projectManagePromptContext: "<reference-files>project-manage</reference-files>",
        },
        parts,
      ),
    ).toEqual([
      {
        type: "text",
        text: expect.stringContaining("projects-iris-context"),
      },
      {
        type: "text",
        text: "<reference-files>project-manage</reference-files>",
      },
      { type: "file", path: "/home/atman/repos/client-x/AGENTS.md" },
      {
        type: "text",
        text: [
          '<user-request from="user" to="iris">',
          "Register /home/atman/repos/client-x",
          "</user-request>",
        ].join("\n"),
      },
    ]);
  });

  it("prepends the same pinned skill reference before follow-up sends", () => {
    expect(
      prependProjectIrisContext(
        {
          helperText: "Register, rename, refresh, or delete projects by chatting with Iris.",
          projectManagePromptContext: "<reference-files>project-manage</reference-files>",
        },
        [{ type: "text", text: "Rename client-x to Client Platform" }],
      ),
    ).toEqual([
      {
        type: "text",
        text: expect.stringContaining("projects-iris-context"),
      },
      {
        type: "text",
        text: "<reference-files>project-manage</reference-files>",
      },
      {
        type: "text",
        text: [
          '<user-request from="user" to="iris">',
          "Rename client-x to Client Platform",
          "</user-request>",
        ].join("\n"),
      },
    ]);
  });

  it("keeps file-only prompts as file parts without adding an empty user-request wrapper", () => {
    const parts: PromptPart[] = [{ type: "file", path: "/home/atman/repos/client-x/AGENTS.md" }];

    const result = prependProjectIrisContext(
      {
        helperText: "Register, rename, refresh, or delete projects by chatting with Iris.",
        projectManagePromptContext: "<reference-files>project-manage</reference-files>",
      },
      parts,
    );

    expect(result).toEqual([
      {
        type: "text",
        text: expect.stringContaining("projects-iris-context"),
      },
      {
        type: "text",
        text: "<reference-files>project-manage</reference-files>",
      },
      { type: "file", path: "/home/atman/repos/client-x/AGENTS.md" },
    ]);
  });
});