import type { RuleDefinition } from "@/lib/operation-definition/types";

export interface RuleMatch {
  matchedIndex: number;
  condition: string;
  next: string;
}

export function evaluateRuleIndex(ruleIndex: number, rules: RuleDefinition[]): RuleMatch | null {
  if (!Number.isInteger(ruleIndex) || ruleIndex < 0 || ruleIndex >= rules.length) {
    return null;
  }

  const rule = rules[ruleIndex];
  return {
    matchedIndex: ruleIndex,
    condition: rule.condition,
    next: rule.next,
  };
}