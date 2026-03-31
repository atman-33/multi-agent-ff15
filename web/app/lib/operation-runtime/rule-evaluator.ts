import type { RuleDefinition } from "@/lib/operation-definition/types";

export interface RuleMatch {
  matchedIndex: number;
  condition: string;
  next: string;
}

const STEP_TAG_REGEX = /\[STEP:(\d+)\]/g;

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

export function evaluateRules(reportContent: string, rules: RuleDefinition[]): RuleMatch | null {
  if (rules.length === 0) {
    return null;
  }

  let lastMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: regex iteration pattern
  while ((match = STEP_TAG_REGEX.exec(reportContent)) !== null) {
    lastMatch = match;
  }

  if (!lastMatch) {
    return null;
  }

  return evaluateRuleIndex(Number.parseInt(lastMatch[1], 10), rules);
}