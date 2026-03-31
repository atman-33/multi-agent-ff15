type XmlAttributeValue = boolean | number | string;

function escapeXmlAttribute(value: XmlAttributeValue): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildXmlSection(
  tagName: string,
  content: string,
  attributes?: Record<string, XmlAttributeValue | null | undefined>,
): string {
  const normalizedContent = content.trim();
  const attributeParts: string[] = [];

  for (const [key, value] of Object.entries(attributes ?? {})) {
    if (value === undefined || value === null) {
      continue;
    }

    attributeParts.push(` ${key}="${escapeXmlAttribute(value)}"`);
  }

  const attributeText = attributeParts.join("");

  if (!normalizedContent) {
    return `<${tagName}${attributeText}></${tagName}>`;
  }

  return `<${tagName}${attributeText}>\n${normalizedContent}\n</${tagName}>`;
}

export function joinXmlSections(sections: Array<string | null | undefined>): string {
  return sections
    .map((section) => section?.trim() ?? "")
    .filter((section) => section.length > 0)
    .join("\n\n");
}

export function buildTextSection(
  tagName: string,
  content: string,
  attributes?: Record<string, XmlAttributeValue | null | undefined>,
): string {
  return buildXmlSection(tagName, content, { format: "text", ...attributes });
}

export function buildMarkdownSection(
  tagName: string,
  content: string,
  attributes?: Record<string, XmlAttributeValue | null | undefined>,
): string {
  return buildXmlSection(tagName, content, { format: "markdown", ...attributes });
}

export function buildYamlSection(
  tagName: string,
  content: string,
  attributes?: Record<string, XmlAttributeValue | null | undefined>,
): string {
  return buildXmlSection(tagName, content, { format: "yaml", ...attributes });
}

export function wrapOperationPrompt(sections: Array<string | null | undefined>): string {
  return buildXmlSection("operation-prompt", joinXmlSections(sections), { schema: "v2" });
}
