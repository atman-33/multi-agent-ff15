import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";
import { getProjectRoot } from "./get-project-root.server";
import { getOpencodeBaseUrl } from "./opencode-server";

export const createProjectOpencodeClient = (baseUrl: string) => {
  return createOpencodeClient({
    baseUrl,
    directory: getProjectRoot(),
  });
};

export const getOpencodeClient = () => {
  return createProjectOpencodeClient(getOpencodeBaseUrl());
};
