import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FacetOption {
  id: string;
  label: string;
}

interface LunafreyaFacetControlsProps {
  jobOptions: FacetOption[];
  onSelectedJobIdChange: (jobId: string | null) => void;
  onSelectedSkillIdsChange: (skillIds: string[]) => void;
  selectedJobId: string | null;
  selectedSkillIds: string[];
  skillOptions: FacetOption[];
}

export function LunafreyaFacetControls({
  jobOptions,
  onSelectedJobIdChange,
  onSelectedSkillIdsChange,
  selectedJobId,
  selectedSkillIds,
  skillOptions,
}: LunafreyaFacetControlsProps) {
  return (
    <div className="space-y-3 rounded-lg border border-cyan-700/40 bg-cyan-500/10 p-3 text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] backdrop-blur-sm">
      <div className="space-y-2">
        <label className="block font-medium text-sm" htmlFor="lunafreya-job">
          Lunafreya Job
        </label>
        <div className="mt-2">
          <Select
            onValueChange={(value) => onSelectedJobIdChange(value === "__default__" ? null : value)}
            value={selectedJobId ?? "__default__"}
          >
            <SelectTrigger
              className="border-slate-700/70 bg-slate-950/55 text-slate-100 backdrop-blur-sm data-placeholder:text-slate-500"
              id="lunafreya-job"
            >
              <SelectValue placeholder="Select Lunafreya job" />
            </SelectTrigger>
            <SelectContent className="border-slate-700/70 bg-slate-900/85 text-slate-100 backdrop-blur-xl">
              <SelectItem value="__default__">Default (Lunafreya Autonomous)</SelectItem>
              {jobOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="font-medium text-sm">Lunafreya Skills</div>
          {selectedSkillIds.length > 0 ? (
            <Button onClick={() => onSelectedSkillIdsChange([])} size="sm" type="button" variant="outline">
              Clear Skills
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {skillOptions.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-700/70 px-3 py-2 text-xs text-slate-400">
              No Lunafreya skills available for this target.
            </div>
          ) : (
            skillOptions.map((option) => {
              const isSelected = selectedSkillIds.includes(option.id);
              return (
                <Button
                  key={option.id}
                  onClick={() =>
                    onSelectedSkillIdsChange(
                      isSelected
                        ? selectedSkillIds.filter((skillId) => skillId !== option.id)
                        : [...selectedSkillIds, option.id],
                    )
                  }
                  size="sm"
                  type="button"
                  variant={isSelected ? "default" : "outline"}
                >
                  {option.label}
                </Button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}