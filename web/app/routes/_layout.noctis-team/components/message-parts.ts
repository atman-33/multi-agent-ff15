import type { MessagePart } from "@/routes/_layout.opencode.session.$id/types";

export function extractText(parts: MessagePart[]): string {
  return parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text ?? "")
    .join("")
    .trim();
}

export function extractReasoning(parts: MessagePart[]): string {
  return parts
    .filter((part) => part.type === "reasoning" && typeof part.text === "string")
    .map((part) => part.text ?? "")
    .join("")
    .trim();
}

export function extractTools(parts: MessagePart[]): MessagePart[] {
  return parts.filter((part) => part.type === "tool");
}

export function buildMessageMarkdown(
  text: string,
  reasoning: string,
  tools: MessagePart[]
): string {
  const sections: string[] = [];

  if (text.trim()) {
    sections.push(text.trim());
  }

  if (reasoning.trim()) {
    sections.push(`## Reasoning\n\n${reasoning.trim()}`);
  }

  tools.forEach((tool, index) => {
    const toolSections = [`## Tool ${index + 1}: ${tool.tool ?? "Tool"}`];

    if (tool.state?.status) {
      toolSections.push(`- Status: ${tool.state.status}`);
    }

    if (tool.state?.input) {
      toolSections.push(`### Input\n\n\`\`\`json\n${JSON.stringify(tool.state.input, null, 2)}\n\`\`\``);
    }

    if (tool.state?.output) {
      toolSections.push(`### Output\n\n\`\`\`\n${tool.state.output.trim()}\n\`\`\``);
    }

    if (tool.state?.error) {
      toolSections.push(`### Error\n\n${tool.state.error.trim()}`);
    }

    sections.push(toolSections.join("\n\n"));
  });

  return sections.join("\n\n").trim();
}