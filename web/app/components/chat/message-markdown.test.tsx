import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MessageMarkdown } from "./message-markdown";

describe("message-markdown", () => {
  it("renders a backticked URL as a clickable link", () => {
    const markup = renderToStaticMarkup(
      <MessageMarkdown>{"`https://github.com/tomodachijpf2/srms/pull/238`"}</MessageMarkdown>,
    );

    expect(markup).toContain('href="https://github.com/tomodachijpf2/srms/pull/238"');
  });

  it("keeps fenced URL code blocks as code", () => {
    const markup = renderToStaticMarkup(
      <MessageMarkdown>{"```\nhttps://github.com/tomodachijpf2/srms/pull/238\n```"}</MessageMarkdown>,
    );

    expect(markup).not.toContain('href="https://github.com/tomodachijpf2/srms/pull/238"');
    expect(markup).toContain("<pre><code>https://github.com/tomodachijpf2/srms/pull/238");
  });
});