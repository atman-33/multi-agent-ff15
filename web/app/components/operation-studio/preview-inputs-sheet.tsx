import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { WORKING_PARTY_MEMBER_IDS } from "@/lib/noctis-working-party";
import type { PreviewPartyMode } from "@/lib/operation-debug/debug-preview.server";
import type { ProjectScope } from "@/lib/project-scopes";
import type { WorkerAgentId } from "@/lib/types/mission";
import { LunafreyaFacetControls } from "./lunafreya-facet-controls";

const PREVIEW_PARTY_MODE_OPTIONS: Array<{
  value: PreviewPartyMode;
  label: string;
  description: string;
}> = [
  {
    value: "full",
    label: "Full party",
    description: "Preview with Ignis, Gladiolus, and Prompto all available.",
  },
  {
    value: "solo",
    label: "Solo",
    description: "Preview the retained Noctis-only conversational loop.",
  },
  {
    value: "custom",
    label: "Custom",
    description: "Preview a custom subset of available workers.",
  },
];

const PREVIEW_WORKER_LABELS: Record<WorkerAgentId, string> = {
  ignis: "Ignis",
  gladiolus: "Gladiolus",
  prompto: "Prompto",
};

interface TargetOption {
  label: string;
  value: string;
}

interface LunafreyaFacetOption {
  id: string;
  label: string;
}

interface PreviewInputsSheetProps {
  disableApplyPreview?: boolean;
  draftPreviewPartySummary: string;
  isOpen: boolean;
  lunafreyaJobOptions?: LunafreyaFacetOption[];
  lunafreyaSkillOptions?: LunafreyaFacetOption[];
  onApplyPreview: () => void;
  onClose: () => void;
  onPartyModeChange: (partyMode: PreviewPartyMode) => void;
  onSelectedLunafreyaJobIdChange: (jobId: string | null) => void;
  onSelectedLunafreyaSkillIdsChange: (skillIds: string[]) => void;
  onTargetValueChange: (targetValue: string) => void;
  onTaskInstructionChange: (taskInstruction: string) => void;
  onTogglePreviewWorker: (workerId: WorkerAgentId) => void;
  onUserMessageChange: (userMessage: string) => void;
  partyMode: PreviewPartyMode;
  previewWorkers: WorkerAgentId[];
  scope: ProjectScope;
  selectedEntryDescription?: string | null;
  selectedEntryLabel: string;
  selectedLunafreyaJobId: string | null;
  selectedLunafreyaSkillIds: string[];
  showPartyModeControls: boolean;
  showWorkerTaskSeedControl: boolean;
  targetOptions: TargetOption[];
  targetValue: string;
  taskInstruction: string;
  userMessage: string;
}

export function PreviewInputsSheet({
  disableApplyPreview = false,
  draftPreviewPartySummary,
  isOpen,
  lunafreyaJobOptions = [],
  lunafreyaSkillOptions = [],
  onApplyPreview,
  onClose,
  onPartyModeChange,
  onSelectedLunafreyaJobIdChange,
  onSelectedLunafreyaSkillIdsChange,
  onTargetValueChange,
  onTaskInstructionChange,
  onTogglePreviewWorker,
  onUserMessageChange,
  partyMode,
  previewWorkers,
  scope,
  selectedEntryDescription,
  selectedEntryLabel,
  selectedLunafreyaJobId,
  selectedLunafreyaSkillIds,
  showPartyModeControls,
  showWorkerTaskSeedControl,
  targetOptions,
  targetValue,
  taskInstruction,
  userMessage,
}: PreviewInputsSheetProps) {
  return (
    <Sheet onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
    }} open={isOpen}>
      <SheetContent
        className="flex h-full flex-col gap-0 overflow-hidden border-slate-800/70 bg-slate-950/88 text-slate-100 backdrop-blur-xl sm:max-w-xl"
        side="right"
      >
        <SheetHeader className="border-slate-800/70 border-b bg-white/2 pb-4 text-left">
          <SheetTitle className="text-slate-50">Preview Inputs</SheetTitle>
          <SheetDescription className="text-slate-400">
            Adjust scope, authoring target, and synthetic inputs used to regenerate the selected operation preview.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-auto py-4">
          <div className="space-y-4 pr-1">
            <div className="rounded-lg border border-slate-700/70 bg-slate-900/45 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] backdrop-blur-sm">
              <div className="text-slate-500 text-xs uppercase tracking-wide">Selected operation</div>
              <div className="mt-1 font-semibold text-sm text-slate-50">{selectedEntryLabel}</div>
              {selectedEntryDescription ? (
                <p className="mt-2 text-slate-400 text-xs">{selectedEntryDescription}</p>
              ) : null}
            </div>

            <div className="space-y-2 rounded-lg border border-fuchsia-700/40 bg-fuchsia-500/10 p-3 text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] backdrop-blur-sm">
              <label className="font-medium text-sm" htmlFor="authoring-target">
                Authoring Target
              </label>
              <Select onValueChange={onTargetValueChange} value={targetValue}>
                <SelectTrigger
                  className="border-slate-700/70 bg-slate-950/55 text-slate-100 backdrop-blur-sm data-placeholder:text-slate-500"
                  id="authoring-target"
                >
                  <SelectValue placeholder="Select authoring target" />
                </SelectTrigger>
                <SelectContent className="border-slate-700/70 bg-slate-900/85 text-slate-100 backdrop-blur-xl">
                  {targetOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-fuchsia-100 text-xs">Preview, catalog, and apply destination stay bound to this target.</p>
            </div>

            {scope === "lunafreya" ? (
              <LunafreyaFacetControls
                jobOptions={lunafreyaJobOptions}
                onSelectedJobIdChange={onSelectedLunafreyaJobIdChange}
                onSelectedSkillIdsChange={onSelectedLunafreyaSkillIdsChange}
                selectedJobId={selectedLunafreyaJobId}
                selectedSkillIds={selectedLunafreyaSkillIds}
                skillOptions={lunafreyaSkillOptions}
              />
            ) : null}

            {showPartyModeControls ? (
              <div className="space-y-2 rounded-lg border border-emerald-700/40 bg-emerald-500/10 p-3 text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] backdrop-blur-sm">
                <label className="font-medium text-sm" htmlFor="party-mode">
                  Party Mode
                </label>
                <Select
                  onValueChange={(value) => {
                    if (value === "full" || value === "solo" || value === "custom") {
                      onPartyModeChange(value);
                    }
                  }}
                  value={partyMode}
                >
                  <SelectTrigger
                    className="border-slate-700/70 bg-slate-950/55 text-slate-100 backdrop-blur-sm data-placeholder:text-slate-500"
                    id="party-mode"
                  >
                    <SelectValue placeholder="Select preview party mode" />
                  </SelectTrigger>
                  <SelectContent className="border-slate-700/70 bg-slate-900/85 text-slate-100 backdrop-blur-xl">
                    {PREVIEW_PARTY_MODE_OPTIONS.map((option) => (
                      <SelectItem className="text-slate-100 focus:bg-slate-800/80 focus:text-slate-100" key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-slate-300 text-xs">
                  {PREVIEW_PARTY_MODE_OPTIONS.find((option) => option.value === partyMode)?.description}
                </p>
                <p className="font-medium text-emerald-200 text-xs uppercase tracking-wide">
                  {draftPreviewPartySummary}
                </p>

                {partyMode === "custom" ? (
                  <div className="flex flex-wrap gap-2">
                    {WORKING_PARTY_MEMBER_IDS.map((workerId) => {
                      const active = previewWorkers.includes(workerId);
                      return (
                        <Button
                          key={workerId}
                          onClick={() => onTogglePreviewWorker(workerId)}
                          size="sm"
                          type="button"
                          variant={active ? "default" : "outline"}
                        >
                          {PREVIEW_WORKER_LABELS[workerId]}
                        </Button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-2 rounded-lg border border-blue-700/40 bg-blue-500/10 p-3 text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] backdrop-blur-sm">
              <label className="font-medium text-sm" htmlFor="user-message">
                User Message
              </label>
              <Textarea
                className="border-slate-700/70 bg-slate-950/55 text-slate-100 backdrop-blur-sm"
                id="user-message"
                onChange={(event) => onUserMessageChange(event.target.value)}
                rows={6}
                value={userMessage}
              />
            </div>

            {showWorkerTaskSeedControl ? (
              <div className="space-y-2 rounded-lg border border-amber-700/40 bg-amber-500/10 p-3 text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] backdrop-blur-sm">
                <label className="font-medium text-sm" htmlFor="task-instruction">
                  Worker Task Seed
                </label>
                <Textarea
                  className="border-slate-700/70 bg-slate-950/55 text-slate-100 backdrop-blur-sm"
                  id="task-instruction"
                  onChange={(event) => onTaskInstructionChange(event.target.value)}
                  rows={6}
                  value={taskInstruction}
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-slate-800/70 border-t pt-4">
          <Button onClick={onClose} type="button" variant="outline">
            Close
          </Button>
          <Button disabled={disableApplyPreview} onClick={onApplyPreview} type="button">
            Apply Preview
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}