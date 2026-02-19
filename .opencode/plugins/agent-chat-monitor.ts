import type { Plugin } from "@opencode-ai/plugin";

declare const process: {
  env: Record<string, string | undefined>;
};

function extractUserContent(rawContent: string): string | null {
  if (rawContent.includes("[analyze-mode]")) {
    const sections = rawContent.split(/\n---\n/);
    if (sections.length > 1) {
      const lastSection = sections[sections.length - 1].trim();
      return `[User] ${lastSection}`;
    }
  }

  const cleanContent = rawContent.replace(/^\[user\]\n*/i, "").trim();
  return cleanContent ? `[User] ${cleanContent}` : null;
}

function extractAssistantContent(rawContent: string, agentName: string): string | null {
  if (rawContent.includes("<content>") && rawContent.includes("</content>")) {
    const contentBlockPattern = /<content>[\s\S]*?<\/content>/g;
    const withoutContent = rawContent.replace(contentBlockPattern, "").trim();
    if (withoutContent.length === 0 || withoutContent.match(/^\[Tool: read\]\n*$/)) {
      return null;
    }
  }

  if (rawContent.includes("[Tool:")) {
    const toolPattern = /\[Tool: \w+\][\s\S]*?(Output:.*?\n)?/g;
    const withoutTools = rawContent.replace(toolPattern, "").trim();

    if (withoutTools.length > 0 && !withoutTools.match(/^[\s\-]+$/)) {
      return processAssistantText(withoutTools, agentName);
    }
    return null;
  }

  return processAssistantText(rawContent, agentName);
}

function processAssistantText(content: string, agentName: string): string | null {
  const withoutFileContent = content.replace(/<content>[\s\S]*?<\/content>/g, "[ファイル内容省略]");
  const withoutReadme = withoutFileContent.replace(/\[Project README:[\s\S]*?---\n\n/m, "");
  const cleaned = withoutReadme.replace(/\n{3,}/g, "\n\n").trim();

  return cleaned ? `[${agentName}] ${cleaned}` : null;
}

const AgentChatMonitor: Plugin = async ({ $, client }) => {
  const agentId = process.env.AGENT_ID;

  // Only run for noctis and lunafreya
  if (agentId !== "noctis" && agentId !== "lunafreya") {
    return {};
  }

  const COOLDOWN_MS = 1_000; // 1 second
  const ENABLE_LOGGING = false;
  const MAX_MESSAGES = 5;
  const DASHBOARD_FILE = "dashboard.md";

  let lastCaptureTime = 0;
  let currentSessionId: string | null = null;

  const log = async (message: string): Promise<void> => {
    if (!ENABLE_LOGGING) return;
    try {
      const timestamp = new Date().toISOString();
      await $`echo "[${timestamp}] agent-chat-monitor (${agentId}): ${message}" >> logs/agent-chat-monitor.log`.quiet();
    } catch { }
  };

  const updateDashboard = async (content: string): Promise<void> => {
    try {
      const agentDisplayName = agentId === "noctis" ? "Noctis" : "Lunafreya";
      const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);

      // Read current dashboard
      const currentContent = await $`cat ${DASHBOARD_FILE}`.text().catch(() => "");

      // Split by sections
      const lines = currentContent.split("\n");
      const newLines: string[] = [];
      let inTargetSection = false;
      let sectionFound = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Check if we're entering the target agent's section
        if (line.startsWith(`### 💬 ${agentDisplayName} Latest Chat`)) {
          inTargetSection = true;
          sectionFound = true;
          newLines.push(line);
          newLines.push(content || "_No messages yet_");
          newLines.push("");
          continue;
        }

        // Check if we're leaving the target section (entering next section ONLY)
        // Note: We ignore "---" separators within messages to avoid premature section exit
        if (inTargetSection && (line.startsWith("###") || line.startsWith("##"))) {
          inTargetSection = false;
          // Don't skip this line - it's the next section header
        }

        // Skip lines in target section (they will be replaced)
        if (inTargetSection) {
          continue;
        }

        // Update timestamp in header
        if (line.startsWith("Last Updated:")) {
          newLines.push(`Last Updated: ${timestamp}`);
          continue;
        }

        newLines.push(line);
      }

      // Write updated content
      const updatedContent = newLines.join("\n");
      await $`echo ${updatedContent} > ${DASHBOARD_FILE}`.quiet();

      if (ENABLE_LOGGING) {
        await log(`Dashboard updated for ${agentDisplayName}`);
      }
    } catch (error) {
      if (ENABLE_LOGGING) {
        await log(`Failed to update dashboard: ${error}`);
      }
    }
  };

  return {
    event: async ({ event }) => {
      if (event.type === "session.created") {
        const eventAny = event as any;
        const newSessionId =
          eventAny.session_id ||
          eventAny.sessionID ||
          eventAny.sessionId ||
          eventAny.id ||
          eventAny.properties?.session_id ||
          eventAny.properties?.sessionID ||
          eventAny.properties?.sessionId ||
          eventAny.properties?.id;

        if (newSessionId) {
          currentSessionId = newSessionId;
          if (ENABLE_LOGGING) {
            await log(`Captured session ID from session.created: ${newSessionId}`);
          }
        }
      }

      if (event.type !== "session.idle") return;

      const now = Date.now();
      if (now - lastCaptureTime < COOLDOWN_MS) {
        if (ENABLE_LOGGING) {
          await log("Skipped capture (cooldown active)");
        }
        return;
      }
      lastCaptureTime = now;

      try {
        let sessionId = currentSessionId;

        if (!sessionId) {
          const eventAny = event as any;
          sessionId =
            eventAny.session_id ||
            eventAny.sessionID ||
            eventAny.sessionId ||
            eventAny.id ||
            eventAny.properties?.session_id ||
            eventAny.properties?.sessionID ||
            eventAny.properties?.sessionId ||
            eventAny.properties?.id;
        }

        if (!sessionId) {
          try {
            const sessionsResult = await client.session.list();
            if (sessionsResult?.data && Array.isArray(sessionsResult.data) && sessionsResult.data.length > 0) {
              sessionId = sessionsResult.data[0].id;
            }
          } catch { }
        }

        if (!sessionId) {
          return;
        }

        const messagesResult = await client.session.messages({
          path: { id: sessionId },
        });

        if (!messagesResult?.data || messagesResult.data.length === 0) {
          return;
        }

        const MAX_SEARCH_MESSAGES = 20; // Look back further to find conversation pairs
        const MAX_CONVERSATIONS = 5;    // Show up to 5 conversation pairs

        const messages = messagesResult.data.slice(-MAX_SEARCH_MESSAGES);
        const agentDisplayName = agentId === "noctis" ? "Noctis" : "Lunafreya";

        // Extract raw contents first
        const extractedContents: { role: string, content: string; }[] = [];
        for (let idx = 0; idx < messages.length; idx++) {
          const msg = messages[idx];
          const role = msg.info?.role || "unknown";

          let rawContent = "";
          if (Array.isArray(msg.parts)) {
            rawContent = msg.parts
              .map((part: any) => {
                if (part.type === "text" && part.text) {
                  return part.text;
                }
                return "";
              })
              .filter((text: string) => text.trim().length > 0)
              .join("\n\n");
          }

          let extractedContent: string | null = null;
          if (role === "user") {
            extractedContent = extractUserContent(rawContent);
          } else if (role === "assistant") {
            extractedContent = extractAssistantContent(rawContent, agentDisplayName);
          }

          if (extractedContent && extractedContent.trim().length > 0) {
            extractedContents.push({ role, content: extractedContent });
          }
        }

        // Group into conversation pairs (User -> Assistant sequence)
        // Logic: Scan backwards. Find User message, then attach following Assistant messages.
        const conversations: string[][] = [];
        let currentGroup: string[] = [];

        for (let i = extractedContents.length - 1; i >= 0; i--) {
          const item = extractedContents[i];

          if (item.role === "assistant") {
            // Add assistant message to potential group (prepend as we scan backwards)
            currentGroup.unshift(item.content);
          } else if (item.role === "user") {
            // Found a user message - this completes a conversation group
            currentGroup.unshift(item.content);
            conversations.unshift(currentGroup);
            currentGroup = []; // Reset for next group

            // Limit to MAX_CONVERSATIONS
            if (conversations.length >= MAX_CONVERSATIONS) {
              break;
            }
          }
        }

        // Handle case where we have assistant messages left over (orphaned at start)
        // or user message without assistant response (unanswered) - already handled by logic

        if (conversations.length === 0) {
          // Fallback if no proper conversation pairs found (e.g. only assistant messages)
          // Just take the raw items
          const flatList = extractedContents.map(c => c.content);
          const fallbackContent = flatList.slice(-MAX_CONVERSATIONS).join("\n\n---\n\n");
          if (fallbackContent.trim()) {
            await updateDashboard(fallbackContent);
          }
          return;
        }

        // Format content
        let formattedContent: string;
        if (conversations.length > 1) {
          const pastConversations = conversations.slice(0, -1); // All except last
          const latestConversation = conversations[conversations.length - 1]; // Last one

          const pastText = pastConversations.map(group => group.join("\n\n---\n\n")).join("\n\n---\n\n");
          const latestText = latestConversation.join("\n\n---\n\n");

          formattedContent =
            `<details>\n<summary>💬 Past ${pastConversations.length} conversation${pastConversations.length !== 1 ? 's' : ''}</summary>\n\n` +
            pastText +
            `\n\n</details>\n\n` +
            latestText;
        } else {
          // Only one conversation
          formattedContent = conversations[0].join("\n\n---\n\n");
        }

        if (!formattedContent.trim()) {
          return;
        }

        await updateDashboard(formattedContent);

      } catch (error) {
        if (ENABLE_LOGGING) {
          await log(`Error in event handler: ${error}`);
        }
      }
    },
  };
};

export default AgentChatMonitor;
