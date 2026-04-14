import type { AgentId, WorkerAgentId } from "@/lib/types/mission";

export type FileContentSource = { file: string; inline?: never };
export type InlineContentSource = { inline: string; file?: never };
export type ContentSource = FileContentSource | InlineContentSource;

export interface ReportOutputContractDefinition {
  name: string;
  format: ContentSource;
}

export interface DelegationDefinition {
  allowed_workers: WorkerAgentId[];
  worker_job?: ContentSource;
  worker_instruction?: ContentSource;
  worker_skills?: FileContentSource[];
  worker_policies?: ContentSource[];
}

export interface OperationDefinition {
  sourcePath: string;
  name: string;
  description: string;
  initial_step: string;
  jobs: Record<string, string>;
  instructions: Record<string, string>;
  skills: Record<string, string>;
  policies: Record<string, string>;
  steps: StepDefinition[];
}

export type StepAgent = AgentId;

export interface StepDefinition {
  name: string;
  agent: StepAgent;
  job?: ContentSource;
  instruction?: ContentSource;
  skills?: FileContentSource[];
  policies?: ContentSource[];
  output_contracts?: {
    report: ReportOutputContractDefinition[];
  };
  delegation?: DelegationDefinition;
  rules: RuleDefinition[];
}

export interface RuleDefinition {
  condition: string;
  next: string;
}

export interface ResolvedSkillEntry {
  name: string;
  description: string;
  file: string;
}

export interface ResolvedFacets {
  job: string;
  instruction: string;
  skills: ResolvedSkillEntry[];
  policies: string[];
  outputContracts: string[];
}