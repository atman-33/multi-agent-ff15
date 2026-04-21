import type { PromptPart } from "@/lib/prompt-parts";
import { buildTextSection, buildXmlSection } from "@/lib/prompt-composition-engine/prompt-xml";

export type ProjectIrisPromptConfig = {
  helperText: string;
  projectManagePromptContext: string;
};

export function buildProjectIrisContextText(input: {
  helperText: string;
}): string {
  return buildXmlSection(
    "projects-iris-context",
    [
      "Use the pinned project-manage skill to perform project registry work for User.",
      input.helperText,
      "Keep the interaction chat-first and tell User when a manual refresh is needed on the Projects page.",
    ].join("\n"),
  );
}

function buildProjectIrisUserRequestText(parts: PromptPart[]): string | null {
  const text = parts
    .filter((part): part is Extract<PromptPart, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();

  if (!text) {
    return null;
  }

  return buildTextSection("user-request", text, {
    from: "user",
    to: "iris",
  });
}

export function prependProjectIrisContext(
  config: ProjectIrisPromptConfig,
  parts: PromptPart[],
): PromptPart[] {
  const userRequestText = buildProjectIrisUserRequestText(parts);
  const promptParts: PromptPart[] = [];
  let userRequestInserted = false;

  for (const part of parts) {
    if (part.type !== "text") {
      promptParts.push(part);
      continue;
    }

    if (!userRequestText || userRequestInserted) {
      continue;
    }

    promptParts.push({
      type: "text",
      text: userRequestText,
    });
    userRequestInserted = true;
  }

  if (userRequestText && !userRequestInserted) {
    promptParts.push({
      type: "text",
      text: userRequestText,
    });
  }

  return [
    {
      type: "text",
      text: buildProjectIrisContextText({ helperText: config.helperText }),
    },
    {
      type: "text",
      text: config.projectManagePromptContext,
    },
    ...promptParts,
  ];
}