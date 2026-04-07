import type { RuleDefinition } from "@/lib/operation-definition/types";

export interface RuleMatch {
  matchedIndex: number;
  condition: string;
  next: string;
}

export function evaluateNextStep(next: string, rules: RuleDefinition[]): RuleMatch | null {
  const normalizedNext = next.trim();
  if (!normalizedNext) {
    return null;
  }

  const matchedIndex = rules.findIndex((rule) => rule.next === normalizedNext);
  if (matchedIndex < 0) {
    return null;
  }

  const rule = rules[matchedIndex];
  return {
    matchedIndex,
    condition: rule.condition,
    next: rule.next,
  };
}