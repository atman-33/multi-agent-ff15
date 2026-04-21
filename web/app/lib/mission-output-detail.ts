import type { MissionOutputMetadata } from "@/lib/types/mission";

export interface MissionOutputLoaderData {
  filename: string;
  missionId: string;
  step: string;
  taskId: string;
}

export interface MissionOutputDocumentState {
  author: string;
  content: string;
  date: string;
  displayMode: "markdown" | "metadata-only" | "empty";
  error: string | null;
  filePath: string;
  frontmatter: Record<string, unknown> | null;
  metadata?: MissionOutputMetadata | null;
  loading: boolean;
  rawContent: string;
  tags: string[];
  title: string;
}

type OutputRouteResponse = Partial<
  Omit<MissionOutputDocumentState, "error" | "loading"> & { error?: string | null }
>;

export function createOutputDocumentState(
  filename: string,
  overrides: Partial<MissionOutputDocumentState> = {},
): MissionOutputDocumentState {
  return {
    author: "",
    content: "",
    date: "",
    displayMode: "empty",
    error: null,
    filePath: "",
    frontmatter: null,
    loading: false,
    metadata: null,
    rawContent: "",
    tags: [],
    title: filename || "Mission output",
    ...overrides,
  };
}

export function buildMissionOutputRequestPath(loaderData: MissionOutputLoaderData): string {
  const query = new URLSearchParams({
    file: loaderData.filename,
    step: loaderData.step,
    taskId: loaderData.taskId,
  });

  return `/api/missions/${encodeURIComponent(loaderData.missionId)}/output?${query.toString()}`;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export async function loadMissionOutputDocument(input: {
  fetchImpl?: typeof fetch;
  loaderData: MissionOutputLoaderData;
  signal: AbortSignal;
}): Promise<MissionOutputDocumentState> {
  const { loaderData } = input;
  const response = await (input.fetchImpl ?? fetch)(buildMissionOutputRequestPath(loaderData), {
    signal: input.signal,
  });
  const data = (await response.json().catch(() => ({}))) as OutputRouteResponse;

  if (!response.ok) {
    throw new Error(
      typeof data.error === "string" ? data.error : `Unable to load output (${response.status})`,
    );
  }

  return createOutputDocumentState(loaderData.filename, {
    author: typeof data.author === "string" ? data.author : "",
    content: typeof data.content === "string" ? data.content : "",
    date: typeof data.date === "string" ? data.date : "",
    displayMode:
      data.displayMode === "markdown" ||
      data.displayMode === "metadata-only" ||
      data.displayMode === "empty"
        ? data.displayMode
        : "empty",
    filePath: typeof data.filePath === "string" ? data.filePath : "",
    frontmatter:
      data.frontmatter && typeof data.frontmatter === "object" && !Array.isArray(data.frontmatter)
        ? data.frontmatter
        : null,
    loading: false,
    metadata: data.metadata ?? null,
    rawContent: typeof data.rawContent === "string" ? data.rawContent : "",
    tags: Array.isArray(data.tags)
      ? data.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    title: typeof data.title === "string" && data.title.trim() ? data.title : loaderData.filename,
  });
}