export function buildInjectedPromptContext(sessionId: string): string {
  return [`<internal-context>`, `session_id: ${sessionId}`, `</internal-context>`].join("\n");
}