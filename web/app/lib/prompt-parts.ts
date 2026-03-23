export type PromptPart =
  | { type: "text"; text: string }
  | { type: "file"; path: string; content?: string };

export type TextPromptPart = { type: "text"; text: string };

export function expandPromptParts(parts: PromptPart[]): TextPromptPart[] {
  return parts.flatMap((part) => {
    if (part.type === "text") {
      return [{ type: "text" as const, text: part.text }];
    }

    return [
      { type: "text" as const, text: `@${part.path}` },
      { type: "text" as const, text: part.content ? `\n${part.content}` : "" },
    ].filter((item) => item.text.length > 0);
  });
}

export function buildPromptPayloadParts(
  injectedContext: string,
  parts: PromptPart[]
): TextPromptPart[] {
  return [{ type: "text", text: injectedContext }, ...expandPromptParts(parts)];
}

export function stringifyPromptParts(parts: PromptPart[]): string {
  return expandPromptParts(parts)
    .map((part) => part.text)
    .join("")
    .trim();
}
