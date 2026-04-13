import type { AgentId, WorkerAgentId } from "@/lib/types/mission";

export type ContentSource = { file: string; inline?: never } | { inline: string; file?: never };

export interface ReportOutputContractDefinition {
  name: string;
  format: ContentSource;
}

export interface DelegationDefinition {
  allowed_workers: WorkerAgentId[];
  worker_job?: ContentSource;
  worker_instruction?: ContentSource;
  worker_knowledge?: ContentSource[];
  worker_policies?: ContentSource[];
}

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

export type StepAgent = AgentId;

export interface StepDefinition {
  name: string;
  agent: StepAgent;
  job?: ContentSource;
  instruction?: ContentSource;
  knowledge?: ContentSource[];
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

export type ResolvedKnowledgeEntry =
  | {
      kind: "body";
      content: string;
    }
  | {
      kind: "reference";
      name: string;
      description: string;
      source: string;
    };

export interface ResolvedFacets {
  job: string;
  instruction: string;
  knowledge: ResolvedKnowledgeEntry[];
  policies: string[];
  outputContracts: string[];
}