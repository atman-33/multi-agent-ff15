import {
  ArrowUpRight,
  BadgeInfo,
  Check,
  ChevronDown,
  Copy,
  Inbox,
} from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import ChatMarkdown, { stripAnsi } from "@/components/chat-markdown";
import {
  type ChatDetailItem,
  MESSAGE_PREVIEW_MAX_CHARS,
} from "@/lib/chat-detail";
import type { ChatTimelineMessageItem } from "@/lib/chat-timeline";
import { cn } from "@/lib/utils";

interface MessageCardProps {
  className?: string;
  onOpenDetail?: (item: ChatDetailItem) => void;
  record: ChatTimelineMessageItem;
}

interface ProjectInstructionContextViewModel {
  openspecRoot: string | null;
  policies: string[];
  projectId: string | null;
  projectRoot: string | null;
  scope: string | null;
}

const POLICY_SPLIT_REGEX = /\(\d+\)\s*/;
const PROJECT_CONTEXT_BLOCK_REGEX =
  /<project-instruction-context>([\s\S]*?)<\/project-instruction-context>/;
const PROJECT_SCOPE_REGEX = /project_scope:\s*(.+)/;
const PROJECT_ID_REGEX = /-\s+id:\s*(.+)/;
const PROJECT_ROOT_REGEX = /root_path:\s*(.+)/;
const OPENSPEC_ROOT_REGEX = /openspec_context:\s*[\s\S]*?root:\s*(.+)/;
const POLICY_REGEX = /policy:\s*([\s\S]*)/;
const PROJECT_CONTEXT_REMOVE_REGEX =
  /<project-instruction-context>[\s\S]*?<\/project-instruction-context>/;
const INBOX_NOTICE_REGEX =
  /(You have new inbox messages\.\s*Run:\s*scripts\/inbox_read\.sh\s+\w+)/;

function parsePolicies(value: string): string[] {
  return value
    .split(POLICY_SPLIT_REGEX)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseProjectInstructionContext(
  content: string
): ProjectInstructionContextViewModel | null {
  const match = content.match(PROJECT_CONTEXT_BLOCK_REGEX);
  if (!match) {
    return null;
  }

  const raw = match[1]?.trim() ?? "";
  const scope = raw.match(PROJECT_SCOPE_REGEX)?.[1]?.trim() ?? null;
  const projectId = raw.match(PROJECT_ID_REGEX)?.[1]?.trim() ?? null;
  const projectRoot = raw.match(PROJECT_ROOT_REGEX)?.[1]?.trim() ?? null;
  const openspecRoot = raw.match(OPENSPEC_ROOT_REGEX)?.[1]?.trim() ?? null;
  const policyRaw = raw.match(POLICY_REGEX)?.[1]?.trim() ?? "";

  return {
    openspecRoot,
    policies: parsePolicies(policyRaw),
    projectId,
    projectRoot,
    scope,
  };
}

function removeProjectInstructionContext(content: string): string {
  return content.replace(PROJECT_CONTEXT_REMOVE_REGEX, "").trim();
}

function extractInboxNotice(content: string): {
  notice: string | null;
  remainder: string;
} {
  const match = content.match(INBOX_NOTICE_REGEX);
  if (!match) {
    return { notice: null, remainder: content.trim() };
  }

  return {
    notice: match[1]?.trim() ?? null,
    remainder: content.replace(match[0], "").trim(),
  };
}

function MessageCard({ record, className, onOpenDetail }: MessageCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [contextExpanded, setContextExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const contextChevronClassName = cn(
    "ml-auto h-3 w-3 text-sky-200/70 transition-transform duration-300 ease-out",
    contextExpanded ? "rotate-180" : "rotate-0"
  );
  const messageChevronClassName = cn(
    "h-3 w-3 transition-transform duration-300 ease-out",
    expanded ? "rotate-180" : "rotate-0"
  );

  const handleCopy = useCallback(() => {
    const clean = stripAnsi(record.content);
    navigator.clipboard.writeText(clean).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [record.content]);

  const clean = stripAnsi(record.content);
  const projectContext = useMemo(
    () => parseProjectInstructionContext(clean),
    [clean]
  );
  const contentWithoutContext = useMemo(
    () => removeProjectInstructionContext(clean),
    [clean]
  );
  const { notice: inboxNotice, remainder: messageBody } = useMemo(
    () => extractInboxNotice(contentWithoutContext),
    [contentWithoutContext]
  );
  const shouldFold = messageBody.length > MESSAGE_PREVIEW_MAX_CHARS;

  const ts = new Date(record.lastTs);
  const showFineGrainedTime =
    Math.abs(ts.getTime() - new Date(record.firstTs).getTime()) < 1000;
  const timeStr = ts.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    ...(showFineGrainedTime ? { fractionalSecondDigits: 3 as const } : {}),
  });

  const isError = record.kind === "error";
  const contextSummary = projectContext
    ? `${projectContext.projectId ?? "project"} · ${projectContext.scope ?? "scope"} · Serena + OpenSpec (${projectContext.policies.length} rules)`
    : null;
  const inboxSummary = inboxNotice?.replace(/\s+/g, " ").trim() ?? null;

  return (
    <div className="group/card">
      <div
        className={cn(
          "space-y-1 rounded-md border px-3 py-2 text-sm",
          isError
            ? "border-red-500/40 bg-red-500/10 text-red-300"
            : "border-border/40 bg-white/5",
          className
        )}
      >
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>{timeStr}</span>
          {record.kind !== "answer" && (
            <span
              className={cn(
                "rounded-sm px-1 font-medium",
                isError ? "bg-red-500/20 text-red-400" : "bg-muted/40"
              )}
            >
              {record.kind}
            </span>
          )}
        </div>

        <div className="space-y-2">
          {projectContext ? (
            <div className="rounded-md border border-sky-500/20 bg-sky-500/5 px-2.5 py-1.5">
              <button
                className="flex w-full min-w-0 items-center gap-2 text-left"
                onClick={() => setContextExpanded((value) => !value)}
                type="button"
              >
                <BadgeInfo className="h-3.5 w-3.5 shrink-0 text-sky-300" />
                <span className="shrink-0 font-medium text-[11px] text-sky-100">
                  Project Context
                </span>
                <span className="shrink-0 rounded-full border border-sky-500/20 bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-200/80">
                  Injected
                </span>
                <span className="min-w-0 flex-1 truncate text-[11px] text-sky-100/80">
                  {contextSummary ?? "Injected project instructions"}
                </span>
                <ChevronDown className={contextChevronClassName} />
              </button>

              <div
                className={cn(
                  "grid transition-all duration-300 ease-out",
                  contextExpanded
                    ? "mt-2 grid-rows-[1fr] opacity-100"
                    : "mt-0 grid-rows-[0fr] opacity-0"
                )}
              >
                <div className="overflow-hidden">
                  <div
                    className={cn(
                      "grid gap-2 border-sky-500/10 border-t pt-2 text-[11px] text-sky-50/85 transition-all duration-300 ease-out",
                      contextExpanded ? "translate-y-0" : "-translate-y-1"
                    )}
                  >
                    <div>
                      <div className="text-sky-200/60 uppercase tracking-[0.12em]">
                        Scope
                      </div>
                      <div>{projectContext.scope ?? "Unknown"}</div>
                    </div>
                    <div>
                      <div className="text-sky-200/60 uppercase tracking-[0.12em]">
                        Active Project
                      </div>
                      <div>{projectContext.projectId ?? "Unknown"}</div>
                      {projectContext.projectRoot ? (
                        <div className="font-mono text-[10px] text-sky-100/60">
                          {projectContext.projectRoot}
                        </div>
                      ) : null}
                    </div>
                    {projectContext.openspecRoot ? (
                      <div>
                        <div className="text-sky-200/60 uppercase tracking-[0.12em]">
                          OpenSpec Root
                        </div>
                        <div className="font-mono text-[10px] text-sky-100/70">
                          {projectContext.openspecRoot}
                        </div>
                      </div>
                    ) : null}
                    {projectContext.policies.length > 0 ? (
                      <div>
                        <div className="text-sky-200/60 uppercase tracking-[0.12em]">
                          Policies
                        </div>
                        <ol className="list-decimal space-y-1 pl-4">
                          {projectContext.policies.map((policy) => (
                            <li key={policy}>{policy}</li>
                          ))}
                        </ol>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {inboxNotice ? (
            <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5 text-[11px] text-amber-100/85">
              <div className="flex min-w-0 items-center gap-2">
                <Inbox className="h-3.5 w-3.5 shrink-0 text-amber-300" />
                <span className="shrink-0 font-medium text-amber-100">
                  Inbox Notice
                </span>
                <span className="min-w-0 truncate text-amber-100/80">
                  {inboxSummary}
                </span>
              </div>
            </div>
          ) : null}

          {messageBody ? (
            <div className="relative overflow-hidden transition-all duration-300 ease-out">
              <div
                className={cn(
                  "transition-all duration-300 ease-out",
                  shouldFold && !expanded ? "max-h-48" : "max-h-[120rem]"
                )}
              >
                <ChatMarkdown
                  className="space-y-1 text-foreground/90 text-xs leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                  content={messageBody}
                />
              </div>
              {shouldFold && !expanded && (
                <div className="pointer-events-none absolute right-0 bottom-0 left-0 h-8 bg-gradient-to-t from-white/5 to-transparent" />
              )}
            </div>
          ) : null}
        </div>

        {shouldFold && messageBody && (
          <button
            className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => setExpanded((value) => !value)}
            type="button"
          >
            {expanded ? (
              <>
                <ChevronDown className={messageChevronClassName} />
                Collapse
              </>
            ) : (
              <>
                <ChevronDown className={messageChevronClassName} />
                Show more
              </>
            )}
          </button>
        )}
      </div>

      <div className="mt-1 flex justify-start gap-2 opacity-0 transition-opacity group-hover/card:opacity-100">
        {onOpenDetail && (
          <button
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
            onClick={() => onOpenDetail({ type: "message", item: record })}
            title="Open larger message view"
            type="button"
          >
            <ArrowUpRight className="h-3 w-3" />
            Open detail
          </button>
        )}
        <button
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          onClick={handleCopy}
          title="Copy as markdown"
          type="button"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-green-400" />
              <span className="text-green-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default memo(MessageCard);
