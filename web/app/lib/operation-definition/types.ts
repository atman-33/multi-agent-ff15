import type { WorkerAgentId } from "@/lib/types/mission";

export interface OperationDefinition {
  sourcePath: string;
  name: string;
  description: string;
  initial_step: string;
  jobs: Record<string, string>;
  instructions: Record<string, string>;
  knowledge: Record<string, string>;
  policies: Record<string, string>;
  steps: StepDefinition[];
}

export type StepAgent = WorkerAgentId | "noctis";

export interface StepDefinition {
  name: string;
  agent: StepAgent;
  job_file: string;
  instruction_file: string;
  knowledge_files?: string[];
  policy_files?: string[];
  pass_previous_response: boolean;
  output_contracts?: {
    report: Array<{ name: string; format_file: string }>;
  };
  rules: RuleDefinition[];
}

export interface RuleDefinition {
  condition: string;
  next: string;
}

export interface ResolvedFacets {
  job: string;
  instruction: string;
  knowledge: string[];
  policies: string[];
  outputContracts: string[];
}