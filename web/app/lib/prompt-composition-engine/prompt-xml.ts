type XmlAttributeValue = boolean | number | string;

export function buildXmlSection(
  tagName: string,
  content: string,
  _attributes?: Record<string, XmlAttributeValue | null | undefined>,
): string {
  const normalizedContent = content.trim();

  if (!normalizedContent) {
    return `<${tagName}></${tagName}>`;
  }

  return `<${tagName}>\n${normalizedContent}\n</${tagName}>`;
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
  return buildXmlSection(tagName, content, attributes);
}

export function buildMarkdownSection(
  tagName: string,
  content: string,
  attributes?: Record<string, XmlAttributeValue | null | undefined>,
): string {
  return buildXmlSection(tagName, content, attributes);
}

export function buildYamlSection(
  tagName: string,
  content: string,
  attributes?: Record<string, XmlAttributeValue | null | undefined>,
): string {
  return buildXmlSection(tagName, content, attributes);
}

export function wrapOperationPrompt(sections: Array<string | null | undefined>): string {
  return buildXmlSection("operation-prompt", joinXmlSections(sections));
}
