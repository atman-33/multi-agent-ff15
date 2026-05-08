import type { ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

type MessageMarkdownProps = {
  children: string;
};

const hasScheme = (href: string) => /^[a-z][a-z0-9+.-]*:/i.test(href);

const isExternalHref = (href?: string) => {
  if (!href) {
    return false;
  }

  const normalizedHref = href.trim();

  if (!normalizedHref || normalizedHref.startsWith("#") || normalizedHref.startsWith("/")) {
    return false;
  }

  return normalizedHref.startsWith("//") || hasScheme(normalizedHref);
};

const getTextContent = (children: ReactNode) => {
  if (Array.isArray(children)) {
    return children.map((child) => (typeof child === "string" ? child : String(child))).join("");
  }

  return typeof children === "string" ? children : String(children);
};

const components: Components = {
  a: ({ node: _node, href, rel, target, ...props }) => {
    const isExternal = isExternalHref(href);

    return (
      <a
        {...props}
        href={href}
        rel={isExternal ? "noopener noreferrer" : rel}
        target={isExternal ? "_blank" : target}
      />
    );
  },
  code: ({ node, className, children, ...props }) => {
    const codeText = getTextContent(children);
    const href = codeText.trim();
    const isInlineExternalLink =
      node?.position?.start.line === node?.position?.end.line && isExternalHref(href);

    if (isInlineExternalLink) {
      return (
        <a href={href} rel="noopener noreferrer" target="_blank">
          <code {...props} className={className}>
            {children}
          </code>
        </a>
      );
    }

    return (
      <code {...props} className={className}>
        {children}
      </code>
    );
  },
};

export const MessageMarkdown = ({ children }: MessageMarkdownProps) => {
  return (
    <ReactMarkdown components={components} remarkPlugins={[remarkGfm, remarkBreaks]}>
      {children}
    </ReactMarkdown>
  );
};