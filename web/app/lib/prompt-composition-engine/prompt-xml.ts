type XmlAttributeValue = boolean | number | string;

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildXmlAttributes(
  attributes?: Record<string, XmlAttributeValue | null | undefined>,
): string {
  if (!attributes) {
    return "";
  }

  const serialized = Object.entries(attributes)
    .flatMap(([key, value]) => {
      if (value === null || value === undefined || value === false) {
        return [];
      }

      const serializedValue = value === true ? "true" : String(value);
      return [`${key}="${escapeXmlAttribute(serializedValue)}"`];
    })
    .join(" ");

  return serialized ? ` ${serialized}` : "";
}

export function buildXmlSection(
  tagName: string,
  content: string,
  attributes?: Record<string, XmlAttributeValue | null | undefined>,
): string {
  const normalizedContent = content.trim();
  const serializedAttributes = buildXmlAttributes(attributes);

  if (!normalizedContent) {
    return `<${tagName}${serializedAttributes}></${tagName}>`;
  }

  return `<${tagName}${serializedAttributes}>\n${normalizedContent}\n</${tagName}>`;
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
