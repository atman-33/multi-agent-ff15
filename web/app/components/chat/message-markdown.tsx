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
};

export const MessageMarkdown = ({ children }: MessageMarkdownProps) => {
  return (
    <ReactMarkdown components={components} remarkPlugins={[remarkGfm, remarkBreaks]}>
      {children}
    </ReactMarkdown>
  );
};