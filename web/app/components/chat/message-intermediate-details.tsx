import { BadgeInfo, ChevronDown, FileText, Sparkles, Wrench } from "lucide-react";
import { useMemo } from "react";
import type { ChatMessagePart } from "@/lib/chat-message-parts";
import {
  getPromptContextSourceLabel,
  type PromptContextSection,
  type PromptContextSource,
} from "@/lib/chat-workflow-presentation";
import { cn } from "@/lib/utils";

type Props = {
  reasoning: string;
  reportDetails?: string | null;
  tools: ChatMessagePart[];
  promptContextSections?: PromptContextSection[];
  promptContextSource?: PromptContextSource | null;
  expandedDetailEntries?: Record<string, true>;
  onToggleDetail?: (detailId: string) => void;
};

function PromptContextSectionPanel({
  section,
  expanded,
  onToggle,
}: {
  section: PromptContextSection;
  expanded: boolean;
  onToggle: () => void;
}) {

  return (
    <div className="rounded-md border border-border/30 bg-black/10 p-2">
      <button
        className="flex w-full min-w-0 items-center gap-2 text-left"
        onClick={onToggle}
        type="button"
      >
        <span className="min-w-0 flex-1 text-xs font-semibold text-muted-foreground">
          {section.label}
          {section.preview ? (
            <span className="ml-2 font-normal text-[11px] text-muted-foreground/75">
              {section.preview}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground/75 transition-transform duration-300 ease-out",
            expanded ? "rotate-180" : "rotate-0",
          )}
        />
      </button>

      <div
        className={cn(
          "grid transition-all duration-300 ease-out",
          expanded ? "mt-2 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <div
            className={cn(
              "transition-all duration-300 ease-out",
              expanded ? "translate-y-0" : "-translate-y-1",
            )}
          >
            <pre className="whitespace-pre-wrap rounded-md bg-black/10 p-2 text-[11px] text-foreground/85">
              {section.content}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

export function buildIntermediateDetailSummary(
  reasoning: string,
  tools: ChatMessagePart[],
  reportDetails: string | null = null,
  promptContextSections: PromptContextSection[] = [],
): string {
  const segments: string[] = [];

  if (reportDetails?.trim()) {
    segments.push("report details");
  }

  if (tools.length > 0) {
    segments.push(`${tools.length} tool activit${tools.length === 1 ? "y" : "ies"}`);
  }

  if (reasoning.trim()) {
    segments.push("commentary");
  }

  if (promptContextSections.length > 0) {
    segments.push("prompt context");
  }

  return segments.join(" · ") || "Additional context";
}

export function MessageIntermediateDetails({
  reasoning,
  reportDetails = null,
  tools,
  promptContextSections = [],
  promptContextSource = null,
  expandedDetailEntries = {},
  onToggleDetail,
}: Props) {
  const hasDetails =
    reasoning.trim().length > 0 ||
    tools.length > 0 ||
    Boolean(reportDetails?.trim()) ||
    promptContextSections.length > 0;
  const _detailSummary = useMemo(
    () =>
      buildIntermediateDetailSummary(
        reasoning,
        tools,
        reportDetails,
        promptContextSections,
      ),
    [reasoning, reportDetails, tools, promptContextSections]
  );
  const resolvedPromptContextSource = useMemo(() => {
    if (promptContextSource) {
      return promptContextSource;
    }

    const firstSource = promptContextSections[0]?.source ?? null;
    if (!firstSource) {
      return null;
    }

    return promptContextSections.every((section) => section.source === firstSource)
      ? firstSource
      : null;
  }, [promptContextSections, promptContextSource]);

  if (!hasDetails) {
    return null;
  }

  return (
    <div className="space-y-3">
      {reportDetails?.trim() ? (
        <section className="space-y-2">
          <div className="flex items-center gap-1.5 font-medium text-[10px] text-muted-foreground/70 uppercase tracking-[0.14em]">
            <BadgeInfo className="h-3.5 w-3.5" />
            Report Details
          </div>
          <div className="rounded-md border border-border/30 bg-black/10 px-2.5 py-2 text-[11px] leading-relaxed whitespace-pre-wrap text-foreground/85">
            {reportDetails}
          </div>
        </section>
      ) : null}

      {promptContextSections.length > 0 ? (
        <section className="space-y-2">
          <div className="flex items-center gap-1.5 font-medium text-[10px] text-muted-foreground/70 uppercase tracking-[0.14em]">
            <FileText className="h-3.5 w-3.5" />
            Prompt Context
            {resolvedPromptContextSource ? (
              <span className="rounded-full border border-border/30 bg-black/10 px-1.5 py-0.5 text-[9px] text-muted-foreground/80">
                {getPromptContextSourceLabel(resolvedPromptContextSource)}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {promptContextSections.map((section) => (
              <span
                key={section.key}
                className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-100/85"
              >
                {section.label}
              </span>
            ))}
          </div>
          <div className="space-y-2">
            {promptContextSections.map((section) => (
              <PromptContextSectionPanel
                expanded={Boolean(expandedDetailEntries[section.detailId ?? section.key])}
                key={section.detailId ?? section.key}
                onToggle={() => onToggleDetail?.(section.detailId ?? section.key)}
                section={section}
              />
            ))}
          </div>
        </section>
      ) : null}

      {reasoning ? (
        <section className="space-y-2">
          <div className="flex items-center gap-1.5 font-medium text-[10px] text-muted-foreground/70 uppercase tracking-[0.14em]">
            <Sparkles className="h-3.5 w-3.5" />
            Commentary
          </div>
          <div className="rounded-md border border-border/30 bg-black/10 px-2.5 py-2 text-[11px] leading-relaxed text-foreground/85">
            {reasoning}
          </div>
        </section>
      ) : null}

      {tools.length > 0 ? (
        <section className="space-y-2">
          <div className="flex items-center gap-1.5 font-medium text-[10px] text-muted-foreground/70 uppercase tracking-[0.14em]">
            <Wrench className="h-3.5 w-3.5" />
            Tool Activity
          </div>
          <div className="space-y-2">
            {tools.map((tool, index) => {
              const detailId = tool.detailId ?? `tool:${tool.tool ?? "tool"}:${index}`;
              const expanded = Boolean(expandedDetailEntries[detailId]);

              return (
                <div
                  key={detailId}
                  className="rounded-md border border-border/30 bg-black/10 p-2"
                >
                  <button
                    className="flex w-full items-center gap-2 text-left"
                    onClick={() => onToggleDetail?.(detailId)}
                    type="button"
                  >
                    <span className="flex-1 text-xs font-semibold text-muted-foreground">
                      {tool.tool ?? "Tool"}
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 text-muted-foreground/75 transition-transform duration-300 ease-out",
                        expanded ? "rotate-180" : "rotate-0",
                      )}
                    />
                  </button>

                  <div
                    className={cn(
                      "grid transition-all duration-300 ease-out",
                      expanded ? "mt-2 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0",
                    )}
                  >
                    <div className="overflow-hidden">
                      <div
                        className={cn(
                          "text-[11px] leading-4 text-muted-foreground transition-all duration-300 ease-out",
                          expanded ? "translate-y-0" : "-translate-y-1",
                        )}
                      >
                        {tool.state?.status ? (
                          <div className="mb-1">
                            Status:{" "}
                            <span
                              className={cn(
                                "font-semibold",
                                tool.state.status === "completed" && "text-emerald-400",
                                tool.state.status === "error" && "text-destructive",
                              )}
                            >
                              {tool.state.status}
                            </span>
                          </div>
                        ) : null}
                        {tool.state?.input ? (
                          <pre className="whitespace-pre-wrap rounded-md bg-black/10 p-2 text-[11px] text-foreground/85">
                            {JSON.stringify(tool.state.input, null, 2)}
                          </pre>
                        ) : null}
                        {tool.state?.output ? (
                          <pre className="mt-2 whitespace-pre-wrap rounded-md bg-black/10 p-2 text-[11px] text-foreground/85">
                            {tool.state.output}
                          </pre>
                        ) : null}
                        {tool.state?.error ? (
                          <div className="mt-2 text-xs text-destructive">{tool.state.error}</div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function MessageIntermediateDetailsToggle({
  detailSummary,
  expanded,
  onToggle,
  children,
}: {
  detailSummary: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="mt-3 border-t border-white/10 pt-3">
        <button
          className="flex w-full min-w-0 items-start gap-2 rounded-md px-1 py-0.5 text-left text-[11px] text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
          onClick={onToggle}
          type="button"
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 transition-transform duration-300 ease-out",
              expanded ? "rotate-180" : "rotate-0"
            )}
          />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">
              {expanded ? "Hide intermediate details" : "Show intermediate details"}
            </span>
            <span className="mt-0.5 block wrap-anywhere text-[10px] leading-4 text-muted-foreground/70">
              {detailSummary}
            </span>
          </span>
        </button>
      </div>

      <div
        className={cn(
          "grid transition-all duration-300 ease-out",
          expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <div
            className={cn(
              "pt-3 transition-all duration-300 ease-out",
              expanded ? "translate-y-0" : "-translate-y-1"
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
