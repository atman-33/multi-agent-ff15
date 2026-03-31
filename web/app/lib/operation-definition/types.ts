import type { WorkerAgentId } from "@/lib/types/mission";

export interface OperationDefinition {
  sourcePath: string;
  name: string;
  description: string;
  max_movements: number;
  initial_movement: string;
  jobs: Record<string, string>;
  instructions: Record<string, string>;
  knowledge: Record<string, string>;
  policies: Record<string, string>;
  output_contracts: Record<string, string>;
  movements: MovementDefinition[];
}

export type MovementAgent = WorkerAgentId | "noctis";

export interface MovementDefinition {
  name: string;
  agent: MovementAgent;
  job_file: string;
  instruction_file: string;
  knowledge_files?: string[];
  policy_files?: string[];
  edit: boolean;
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