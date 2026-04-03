#!/usr/bin/env node

const [, , missionId, fromAgent, taskId, next, message, ...rest] = process.argv;

const canonicalMessage = [message, ...rest].filter(Boolean).join(" ").trim();

function parseJsonResponse(text) {
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function formatErrorMessage(response, text) {
  const parsed = parseJsonResponse(text);

  if (parsed && typeof parsed === "object") {
    const error = typeof parsed.error === "string" ? parsed.error.trim() : "";
    const missingOutputs = Array.isArray(parsed.missingOutputs)
      ? parsed.missingOutputs.filter((item) => typeof item === "string" && item.trim())
      : [];
    const retryGuidance =
      typeof parsed.retryGuidance === "string" ? parsed.retryGuidance.trim() : "";

    if (error === "Missing required output files") {
      const lines = [error];
      if (missingOutputs.length > 0) {
        lines.push(...missingOutputs.map((outputPath) => `- ${outputPath}`));
      }
      if (retryGuidance) {
        lines.push(retryGuidance);
      }
      return lines.join("\n");
    }

    if (error) {
      return error;
    }
  }

  return text || `HTTP ${response.status}`;
}

if (!missionId || !fromAgent || !taskId || !next || !canonicalMessage) {
  console.error(
    "Usage: scripts/send_report.sh <missionId> <noctis|ignis|gladiolus|prompto> <taskId> <next> \"<message>\""
  );
  process.exit(1);
}

const origin = process.env.FF15_WEB_ORIGIN || "http://localhost:5173";

try {
  const response = await fetch(
    `${origin}/api/missions/${encodeURIComponent(missionId)}/reports`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromAgent,
        taskId,
        next,
        message: canonicalMessage,
      }),
    }
  );

  const text = await response.text();
  if (!response.ok) {
    throw new Error(formatErrorMessage(response, text));
  }

  console.log(text || "{}");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}