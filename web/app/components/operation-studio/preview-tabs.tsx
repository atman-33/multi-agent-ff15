import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyablePromptBlock } from "@/components/operation-studio/copyable-prompt-block";
import type { FlowStepPreview } from "@/lib/operation-debug/debug-preview.server";

interface PreviewTabsProps {
  advancedBlocks: Array<{ id: string; title: string; description: string; content: string }>;
  completionContract: string;
  facetStats: Array<{ label: string; value: string }>;
  finalPrompt: string;
  runtimeDecision: string;
  selectedStep: FlowStepPreview | null;
  yamlContent: string;
}

export function PreviewTabs({
  advancedBlocks,
  completionContract,
  facetStats,
  finalPrompt,
  runtimeDecision,
  selectedStep,
  yamlContent,
}: PreviewTabsProps) {
  return (
    <Tabs defaultValue="prompt">
      <TabsList className="w-full justify-start border-slate-800/70 bg-slate-950/20" variant="line">
        <TabsTrigger value="prompt" variant="line">
          Prompt
        </TabsTrigger>
        <TabsTrigger value="yaml" variant="line">
          YAML
        </TabsTrigger>
        <TabsTrigger value="contract" variant="line">
          Contract
        </TabsTrigger>
        <TabsTrigger value="decision" variant="line">
          Decision
        </TabsTrigger>
        <TabsTrigger value="advanced" variant="line">
          Advanced
        </TabsTrigger>
      </TabsList>

      <TabsContent className="space-y-4" value="prompt">
        <CopyablePromptBlock
          className="border-blue-700/40 bg-blue-500/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]"
          description={selectedStep?.promptDescription ?? ""}
          highlightTexts={selectedStep?.promptHighlights.map((highlight) => highlight.text) ?? []}
          preClassName="max-h-136"
          title={selectedStep?.promptTitle ?? "Prompt"}
          value={finalPrompt}
        />
      </TabsContent>

      <TabsContent className="space-y-3" value="yaml">
        <CopyablePromptBlock
          preClassName="max-h-136"
          title="Read-only YAML Review"
          description="Canonical YAML derived from the current saved operation or draft."
          value={yamlContent}
        />
      </TabsContent>

      <TabsContent className="space-y-3" value="contract">
        <CopyablePromptBlock
          preClassName="max-h-136"
          title={selectedStep?.completionTitle ?? "Completion Contract"}
          description={selectedStep?.completionDescription ?? ""}
          value={completionContract}
        />
      </TabsContent>

      <TabsContent className="space-y-4" value="decision">
        <CopyablePromptBlock
          className="border-emerald-700/40 bg-emerald-500/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]"
          preClassName="max-h-136"
          title="Runtime Decision"
          description="How Runtime interprets the synthetic report for this step."
          value={runtimeDecision}
        />

        {selectedStep?.workflowGuidance?.trim() ? (
          <CopyablePromptBlock
            preClassName="max-h-136"
            title="Workflow Guidance"
            description="Raw runtime guidance generated after the synthetic report."
            value={selectedStep.workflowGuidance}
          />
        ) : null}
      </TabsContent>

      <TabsContent className="space-y-4" value="advanced">
        <div className="grid gap-3 md:grid-cols-5">
          {facetStats.map((stat) => (
            <div
              className="rounded-lg border border-slate-700/70 bg-slate-950/45 p-3 text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] backdrop-blur-sm"
              key={stat.label}
            >
              <div className="text-slate-400 text-xs uppercase tracking-wide">{stat.label}</div>
              <div className="mt-1 font-medium text-sm">{stat.value}</div>
            </div>
          ))}
        </div>

        {advancedBlocks.map((block) => (
          <CopyablePromptBlock
            key={block.id}
            preClassName="max-h-64"
            title={block.title}
            description={block.description}
            value={block.content}
          />
        ))}
      </TabsContent>
    </Tabs>
  );
}