import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { readAppConfig } from "./app-config.server";
import {
  readRegisteredProjectDefinition,
  type RegisteredProjectDefinition,
} from "./project-config.server";

function slugifyMissionTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return slug || "mission";
}

function formatMissionTimestamp(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid mission timestamp: ${createdAt}`);
  }

  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  const second = String(date.getUTCSeconds()).padStart(2, "0");

  return `${year}${month}${day}-${hour}${minute}${second}`;
}

function readGitStdout(cwd: string, command: string): string | null {
  try {
    const stdout = execSync(command, {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();

    return stdout.length > 0 ? stdout : null;
  } catch {
    return null;
  }
}

function runGitCommand(cwd: string, command: string): string {
  return execSync(command, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function commandHasChanges(cwd: string, command: string): boolean {
  try {
    execSync(command, {
      cwd,
      stdio: ["ignore", "ignore", "ignore"],
    });
    return false;
  } catch {
    return true;
  }
}

function shellQuote(value: string): string {
  return JSON.stringify(value);
}

function hasLocalBranch(rootPath: string, branch: string): boolean {
  try {
    execSync(`git show-ref --verify --quiet ${shellQuote(`refs/heads/${branch}`)}`, {
      cwd: rootPath,
      stdio: ["ignore", "ignore", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

function cloneSharedWorkspace(projectRoot: string, branch: string, workspacePath: string): void {
  mkdirSync(dirname(workspacePath), { recursive: true });
  runGitCommand(
    projectRoot,
    `git clone --shared --branch ${shellQuote(branch)} ${shellQuote(projectRoot)} ${shellQuote(workspacePath)}`,
  );
}

function resolveWorkspaceRootOverride(
  appRoot: string,
  workspaceRootOverride?: string,
): string | undefined {
  if (typeof workspaceRootOverride === "string") {
    return workspaceRootOverride;
  }

  return readAppConfig(appRoot).executionWorkspaceRoot;
}

export function buildMissionExecutionBranchName(createdAt: string, title: string): string {
  const timestamp = formatMissionTimestamp(createdAt);
  return `mission/${timestamp}-${slugifyMissionTitle(title)}`;
}

export function resolveExecutionWorkspaceBaseDir(
  appRoot: string,
  workspaceRootOverride?: string,
): string {
  if (typeof workspaceRootOverride === "string" && workspaceRootOverride.trim().length > 0) {
    return resolve(appRoot, workspaceRootOverride.trim());
  }

  return resolve(appRoot, "..", ".worktrees");
}

export function resolveMissionWorkspacePath(options: {
  appRoot: string;
  executionProjectId: string;
  createdAt: string;
  title: string;
  workspaceRootOverride?: string;
}): string {
  const branchName = buildMissionExecutionBranchName(options.createdAt, options.title);
  const workspaceSlug = branchName.replace(/^mission\//, "");
  const baseDir = resolveExecutionWorkspaceBaseDir(options.appRoot, options.workspaceRootOverride);

  return join(baseDir, options.executionProjectId, workspaceSlug);
}

export function isGitRepository(rootPath: string): boolean {
  if (!rootPath || !existsSync(rootPath)) {
    return false;
  }

  return readGitStdout(rootPath, "git rev-parse --show-toplevel") !== null;
}

export function resolveExecutionBaseBranch(
  project: Pick<RegisteredProjectDefinition, "rootPath" | "defaultBaseBranch">,
): string {
  if (project.defaultBaseBranch) {
    return project.defaultBaseBranch;
  }

  if (!isGitRepository(project.rootPath)) {
    throw new Error("Execution project must point to a git repository.");
  }

  readGitStdout(project.rootPath, "git fetch --quiet origin");
  const remoteHead = readGitStdout(project.rootPath, "git symbolic-ref --quiet --short refs/remotes/origin/HEAD");
  if (remoteHead?.startsWith("origin/")) {
    return remoteHead.slice("origin/".length);
  }

  const localHead = readGitStdout(project.rootPath, "git branch --show-current");
  if (localHead) {
    return localHead;
  }

  throw new Error("Unable to resolve a base branch for the execution project.");
}

export function resolveExecutionProject(
  appRoot: string,
  executionProjectId: string,
): RegisteredProjectDefinition {
  const project = readRegisteredProjectDefinition(appRoot, executionProjectId);
  if (!project) {
    throw new Error("Execution project is not registered.");
  }

  if (!isGitRepository(project.rootPath)) {
    throw new Error("Execution project must point to a git repository.");
  }

  return project;
}

export function provisionMissionExecutionWorkspace(options: {
  appRoot: string;
  createdAt: string;
  executionProjectId: string;
  title: string;
  workspaceRootOverride?: string;
}): {
  baseBranch: string;
  branch: string;
  executionProject: RegisteredProjectDefinition;
  workspacePath: string;
  workspaceStatus: "ready";
} {
  const executionProject = resolveExecutionProject(options.appRoot, options.executionProjectId);
  const baseBranch = resolveExecutionBaseBranch(executionProject);
  const branch = buildMissionExecutionBranchName(options.createdAt, options.title);
  const workspacePath = resolveMissionWorkspacePath({
    appRoot: options.appRoot,
    executionProjectId: options.executionProjectId,
    createdAt: options.createdAt,
    title: options.title,
    workspaceRootOverride: resolveWorkspaceRootOverride(options.appRoot, options.workspaceRootOverride),
  });

  if (!hasLocalBranch(executionProject.rootPath, branch)) {
    runGitCommand(
      executionProject.rootPath,
      `git branch ${shellQuote(branch)} ${shellQuote(baseBranch)}`,
    );
  }

  if (!existsSync(workspacePath)) {
    cloneSharedWorkspace(executionProject.rootPath, branch, workspacePath);
  }

  return {
    executionProject,
    baseBranch,
    branch,
    workspacePath,
    workspaceStatus: "ready",
  };
}

export function ensureMissionExecutionWorkspace(options: {
  appRoot: string;
  executionProjectId: string;
  branch: string;
  workspacePath: string;
}): {
  executionProject: RegisteredProjectDefinition;
  recreated: boolean;
  workspacePath: string;
  workspaceStatus: "ready";
} {
  const executionProject = resolveExecutionProject(options.appRoot, options.executionProjectId);

  if (existsSync(options.workspacePath)) {
    return {
      executionProject,
      recreated: false,
      workspacePath: options.workspacePath,
      workspaceStatus: "ready",
    };
  }

  if (!hasLocalBranch(executionProject.rootPath, options.branch)) {
    throw new Error("Mission branch no longer exists in the source repository.");
  }

  cloneSharedWorkspace(executionProject.rootPath, options.branch, options.workspacePath);

  return {
    executionProject,
    recreated: true,
    workspacePath: options.workspacePath,
    workspaceStatus: "ready",
  };
}

export function isExecutionWorkspaceDirty(workspacePath: string): boolean {
  if (!existsSync(workspacePath)) {
    return false;
  }

  if (!isGitRepository(workspacePath)) {
    return false;
  }

  const untracked = readGitStdout(workspacePath, "git ls-files --others --exclude-standard");
  if (untracked !== null && untracked.length > 0) {
    return true;
  }

  return (
    commandHasChanges(workspacePath, "git diff --quiet --ignore-submodules HEAD --") ||
    commandHasChanges(workspacePath, "git diff --cached --quiet --ignore-submodules HEAD --")
  );
}

export function deleteMissionExecutionWorkspace(options: {
  isRunning: boolean;
  workspacePath: string;
}): void {
  if (options.isRunning) {
    throw new Error("Cannot delete a workspace while the mission is running.");
  }

  if (isExecutionWorkspaceDirty(options.workspacePath)) {
    throw new Error("Execution workspace contains uncommitted changes. Clean the workspace and try again.");
  }

  if (existsSync(options.workspacePath)) {
    rmSync(options.workspacePath, { recursive: true, force: true });
  }
}