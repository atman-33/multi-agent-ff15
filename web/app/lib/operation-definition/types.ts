import type { AgentId } from "@/lib/types/mission";

export type ContentSource = { file: string; inline?: never } | { inline: string; file?: never };

export interface ReportOutputContractDefinition {
  name: string;
  format: ContentSource;
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
  rules: RuleDefinition[];
}

export interface RuleDefinition {
  condition: string;
  next: string;
}

export interface KnowledgeReferenceMetadata {
  name: string;
  description: string;
  critical: string[];
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
      critical: string[];
      source: string;
    };

export interface ResolvedFacets {
  job: string;
  instruction: string;
  knowledge: ResolvedKnowledgeEntry[];
  policies: string[];
  outputContracts: string[];
}