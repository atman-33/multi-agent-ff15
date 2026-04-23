import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { getProjectRoot } from "@/lib/get-project-root.server";
import { parseModelReference, splitModelSelection } from "@/lib/model-variant-selection";
import { getOpencodeClient } from "@/lib/opencode-client";
import { createOpencodeMessageId } from "@/lib/opencode-message-id";
import type { TextPromptPart } from "@/lib/prompt-parts";
import {
  appendOpencodeSdkLabDebugLog,
  getOpencodeSdkLabSnapshot,
} from "@/lib/opencode-sdk-lab.server";

type DebugPayload = {
  action?: unknown;
  agent?: unknown;
  modelRef?: unknown;
  parts?: unknown;
  sessionId?: unknown;
  text?: unknown;
  title?: unknown;
  variant?: unknown;
};

function getOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseTextPromptParts(value: unknown): TextPromptPart[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (part): part is TextPromptPart =>
      !!part &&
      typeof part === "object" &&
      (part as Record<string, unknown>).type === "text" &&
      typeof (part as Record<string, unknown>).text === "string",
  );
}

export const loader = async (_args: LoaderFunctionArgs) => {
  return Response.json(getOpencodeSdkLabSnapshot());
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const requestId = crypto.randomUUID();
  const body = (await request.json().catch(() => null)) as DebugPayload | null;
  const actionName = getOptionalString(body?.action);

  if (!actionName) {
    return Response.json({ error: "Missing action" }, { status: 400 });
  }

  try {
    const client = getOpencodeClient();

    if (actionName === "create") {
      const title = getOptionalString(body?.title) ?? `OpenCode SDK Lab ${new Date().toISOString()}`;

      appendOpencodeSdkLabDebugLog({
        stage: "create-request",
        requestId,
        payload: {
          directory: getProjectRoot(),
          title,
        },
      });

      const result = await client.session.create({
        directory: getProjectRoot(),
        title,
      });

      appendOpencodeSdkLabDebugLog({
        stage: result.error ? "create-error" : "create-result",
        requestId,
        sessionId: result.data?.id,
        payload: {
          error: result.error ?? null,
          session: result.data ?? null,
        },
      });

      if (result.error) {
        return Response.json({ error: result.error }, { status: 502 });
      }

      return Response.json(
        {
          action: "create",
          session: result.data ?? null,
        },
        { status: 201 },
      );
    }

    const sessionId = getOptionalString(body?.sessionId);
    if (!sessionId) {
      return Response.json({ error: "Missing sessionId" }, { status: 400 });
    }

    if (actionName === "abort") {
      appendOpencodeSdkLabDebugLog({
        stage: "abort-request",
        requestId,
        sessionId,
        payload: {},
      });

      const result = await client.session.abort({ sessionID: sessionId });

      appendOpencodeSdkLabDebugLog({
        stage: result.error ? "abort-error" : "abort-result",
        requestId,
        sessionId,
        payload: {
          error: result.error ?? null,
          result: result.data ?? null,
        },
      });

      if (result.error) {
        return Response.json({ error: result.error }, { status: 502 });
      }

      return Response.json({ action: "abort", result: result.data ?? { ok: true }, sessionId });
    }

    if (actionName === "messages") {
      appendOpencodeSdkLabDebugLog({
        stage: "messages-request",
        requestId,
        sessionId,
        payload: {},
      });

      const result = await client.session.messages({ sessionID: sessionId });

      appendOpencodeSdkLabDebugLog({
        stage: result.error ? "messages-error" : "messages-result",
        requestId,
        sessionId,
        payload: {
          error: result.error ?? null,
          messageCount: Array.isArray(result.data) ? result.data.length : null,
        },
      });

      if (result.error) {
        return Response.json({ error: result.error }, { status: 502 });
      }

      return Response.json({
        action: "messages",
        messages: result.data ?? [],
        sessionId,
      });
    }

    if (actionName === "prompt") {
      const parts = parseTextPromptParts(body?.parts);
      const text = getOptionalString(body?.text);
      if (parts.length === 0 && !text) {
        return Response.json({ error: "Missing text or parts" }, { status: 400 });
      }

      const modelRef = getOptionalString(body?.modelRef);
      const variant = getOptionalString(body?.variant);
      const parsedModel = modelRef ? parseModelReference(modelRef, variant) : null;
      if (modelRef && !parsedModel) {
        return Response.json(
          { error: "Invalid modelRef. Expected provider/model." },
          { status: 400 },
        );
      }

      const { model, variant: resolvedVariant } = splitModelSelection(parsedModel);
      const userMessageId = createOpencodeMessageId();
      const agent = getOptionalString(body?.agent);
      const promptParts = parts.length > 0 ? parts : [{ type: "text" as const, text: text ?? "" }];
      const promptText = promptParts.map((part) => part.text).join("");

      appendOpencodeSdkLabDebugLog({
        stage: "prompt-request",
        requestId,
        sessionId,
        payload: {
          agent: agent ?? null,
          model: model ?? null,
          parts: promptParts,
          text: promptText,
          userMessageId,
          variant: resolvedVariant ?? null,
        },
      });

      const result = await client.session.promptAsync({
        sessionID: sessionId,
        messageID: userMessageId,
        parts: promptParts,
        ...(agent ? { agent } : {}),
        ...(model ? { model } : {}),
        ...(resolvedVariant ? { variant: resolvedVariant } : {}),
      });

      appendOpencodeSdkLabDebugLog({
        stage: result.error ? "prompt-error" : "prompt-result",
        requestId,
        sessionId,
        payload: {
          error: result.error ?? null,
          result: result.data ?? null,
          userMessageId,
        },
      });

      if (result.error) {
        return Response.json({ error: result.error }, { status: 502 });
      }

      return Response.json({
        action: "prompt",
        result: result.data ?? null,
        sessionId,
        userMessageId,
      });
    }

    return Response.json({ error: `Unknown action: ${actionName}` }, { status: 400 });
  } catch (error) {
    appendOpencodeSdkLabDebugLog({
      stage:
        actionName === "abort"
          ? "abort-error"
          : actionName === "create"
            ? "create-error"
            : actionName === "messages"
              ? "messages-error"
              : "prompt-error",
      requestId,
      sessionId: getOptionalString(body?.sessionId),
      payload: {
        error,
      },
    });

    return Response.json({ error: "OpenCode server not available" }, { status: 503 });
  }
};