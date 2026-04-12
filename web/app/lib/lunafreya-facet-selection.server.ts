import type { LunafreyaFacetSelection } from "@/lib/types/mission";
import {
  resolveLunafreyaPromptContext,
  type ResolvedLunafreyaPromptContext,
} from "./lunafreya-prompt-context-resolver.server";

export interface ResolvedLunafreyaFacetSelection {
  selection: LunafreyaFacetSelection;
  selectedJobLabel: string | null;
  selectedKnowledgeLabels: string[];
  promptExtension: string | null;
}

export function resolveLunafreyaFacetSelection(input: {
  builtinLanguages: string[];
  executionProjectId?: string;
  selectedJobId?: string;
  selectedKnowledgeIds?: readonly string[];
  root?: string;
}): ResolvedLunafreyaFacetSelection {
  const resolved: ResolvedLunafreyaPromptContext = resolveLunafreyaPromptContext(input);

  return {
    selection: resolved.selection,
    selectedJobLabel: resolved.selectedJobLabel,
    selectedKnowledgeLabels: resolved.selectedKnowledgeLabels,
    promptExtension: resolved.promptExtension,
  };
}