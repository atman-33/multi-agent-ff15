export interface MissionExistenceLoaderData {
  exists: boolean;
  requestedMissionId: string | null;
}

export function buildMissingMissionDescription(requestedMissionId: string | null): string {
  return requestedMissionId
    ? `Mission ${requestedMissionId} could not be restored.`
    : "The selected mission could not be restored.";
}

export function handleMissingMissionRoute(input: {
  fallbackPath: string;
  loaderData: MissionExistenceLoaderData;
  navigate: (path: string, options: { replace: boolean }) => void;
  notify: (message: string, options: { description: string }) => void;
}): boolean {
  if (input.loaderData.exists) {
    return false;
  }

  input.notify("Mission not found", {
    description: buildMissingMissionDescription(input.loaderData.requestedMissionId),
  });
  input.navigate(input.fallbackPath, { replace: true });
  return true;
}

export async function loadMissionExistence(input: {
  endpointPath: string;
  fetchImpl?: typeof fetch;
  request: Request;
  requestedMissionId: string | null;
}): Promise<MissionExistenceLoaderData> {
  if (!input.requestedMissionId) {
    return {
      exists: false,
      requestedMissionId: input.requestedMissionId,
    };
  }

  try {
    const url = new URL(input.request.url);
    const response = await (input.fetchImpl ?? fetch)(
      `${url.origin}${input.endpointPath}/${input.requestedMissionId}`,
    );
    return {
      exists: response.ok,
      requestedMissionId: input.requestedMissionId,
    };
  } catch {
    return {
      exists: false,
      requestedMissionId: input.requestedMissionId,
    };
  }
}