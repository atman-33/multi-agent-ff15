import type { LunafreyaFacetSelection } from "@/lib/types/mission";
import {
  resolveLunafreyaPromptContext,
  type ResolvedLunafreyaPromptContext,
} from "./lunafreya-prompt-context-resolver.server";

export interface ResolvedLunafreyaFacetSelection {
  selection: LunafreyaFacetSelection;
  selectedJobLabel: string | null;
  selectedSkillLabels: string[];
  promptExtension: string | null;
}

export function resolveLunafreyaFacetSelection(input: {
  builtinLanguages: string[];
  executionProjectId?: string;
  selectedJobId?: string;
  selectedSkillIds?: readonly string[];
  root?: string;
}): ResolvedLunafreyaFacetSelection {
  const resolved: ResolvedLunafreyaPromptContext = resolveLunafreyaPromptContext(input);

  return {
    selection: resolved.selection,
    selectedJobLabel: resolved.selectedJobLabel,
    selectedSkillLabels: resolved.selectedSkillLabels,
    promptExtension: resolved.promptExtension,
  };
}