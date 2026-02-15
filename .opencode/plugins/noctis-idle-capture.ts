import type { Plugin } from "@opencode-ai/plugin";

declare const process: {
  env: Record<string, string | undefined>;
};

/**
 * Noctis Idle Capture — On session.idle, captures Noctis conversation content
 * and sends to Iris inbox for dashboard update. Runs on Noctis only.
 * 
 * Uses OpenCode session API to retrieve actual message content instead of
 * tmux screen capture (which fails due to alternate screen buffer).
 */
const NoctisIdleCapture: Plugin = async ({ $, client }) => {
  const agentId = process.env.AGENT_ID;
  if (agentId !== "noctis") {
    return {};
  }

  const COOLDOWN_MS = 10_000;
  const ENABLE_LOGGING = false; // Enable for debugging
  const MAX_MESSAGES = 5; // Capture last N messages for context

  let lastCaptureTime = 0;
  let currentSessionId: string | null = null; // Track current session ID

  const log = async (message: string): Promise<void> => {
    if (!ENABLE_LOGGING) return;
    try {
      const timestamp = new Date().toISOString();
      await $`echo "[${timestamp}] noctis-idle-capture: ${message}" >> logs/noctis-idle-capture.log`.quiet();
    } catch {}
  };

  if (ENABLE_LOGGING) {
    await log("Noctis Idle Capture plugin started");
  }

  return {
    event: async ({ event }) => {
      if (ENABLE_LOGGING) {
        await log(`Event received: type=${event.type}`);
      }
      
      // Track session.created to keep current session ID
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
        } else if (ENABLE_LOGGING) {
          await log(`session.created event keys: ${Object.keys(event).join(", ")}`);
          if (eventAny.properties) {
            await log(`session.created properties: ${JSON.stringify(eventAny.properties)}`);
          }
        }
      }
      
      if (event.type !== "session.idle") return;

      const now = Date.now();
      const timeSinceLastCapture = now - lastCaptureTime;
      if (ENABLE_LOGGING) {
        await log(`session.idle triggered (time since last: ${timeSinceLastCapture}ms)`);
      }
      
      if (now - lastCaptureTime < COOLDOWN_MS) {
        if (ENABLE_LOGGING) {
          await log("Skipped capture (cooldown active)");
        }
        return;
      }
      lastCaptureTime = now;

      try {
        if (ENABLE_LOGGING) {
          await log("Starting capture process");
        }
        
        // Get session ID - prioritize tracked session ID
        let sessionId = currentSessionId;
        if (ENABLE_LOGGING) {
          await log(`Tracked session ID: ${sessionId ? sessionId : "(none)"}`);
        }        
        // Try to get from event as fallback
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
          
          if (ENABLE_LOGGING) {
            await log(`Session ID from event: ${sessionId ? sessionId : "(not found)"}`);
            await log(`Event keys: ${Object.keys(event).join(", ")}`);
            if (eventAny.properties) {
              await log(`Event.properties keys: ${Object.keys(eventAny.properties).join(", ")}`);
              await log(`Event.properties content: ${JSON.stringify(eventAny.properties)}`);
            }
          }
        }
        
        // If still no session ID, try to get the current active session
        if (!sessionId) {
          if (ENABLE_LOGGING) {
            await log("Trying to get current session via client.session.list()");
          }
          try {
            const sessionsResult = await client.session.list();
            if (ENABLE_LOGGING) {
              await log(`Sessions list result: ${JSON.stringify(sessionsResult)}`);
            }
            
            if (sessionsResult?.data && Array.isArray(sessionsResult.data) && sessionsResult.data.length > 0) {
              // Get the most recent session (last in array or first, depending on API order)
              sessionId = sessionsResult.data[0].id;
              if (ENABLE_LOGGING) {
                await log(`Using session ID from list: ${sessionId}`);
              }
            }
          } catch (listErr) {
            if (ENABLE_LOGGING) {
              await log(`Failed to list sessions: ${listErr}`);
            }
          }
        }
        
        if (!sessionId) {
          if (ENABLE_LOGGING) {
            await log("ERROR: No session ID found in event or session list");
          }
          return;
        }

        if (ENABLE_LOGGING) {
          await log(`Fetching messages for session: ${sessionId}`);
        }
        
        // Retrieve session messages via OpenCode API
        const messagesResult = await client.session.messages({
          path: { id: sessionId },
        });

        if (ENABLE_LOGGING) {
          await log(`API response received: ${messagesResult ? "success" : "null"}`);
        }
        
        if (!messagesResult?.data) {
          if (ENABLE_LOGGING) {
            await log(`ERROR: No data in messagesResult: ${JSON.stringify(messagesResult)}`);
          }
          return;
        }
        
        if (ENABLE_LOGGING) {
          await log(`Messages count: ${messagesResult.data.length}`);
        }

        if (messagesResult.data.length === 0) {
          if (ENABLE_LOGGING) {
            await log("No messages found in session (empty array)");
          }
          return;
        }

        // Extract last N messages and format for Iris
        const messages = messagesResult.data.slice(-MAX_MESSAGES);
        if (ENABLE_LOGGING) {
          await log(`Formatting ${messages.length} messages (last ${MAX_MESSAGES})`);
          
          // Log full structure of first message for debugging
          if (messages.length > 0) {
            await log(`Sample message structure: ${JSON.stringify(messages[0], null, 2)}`);
          }
        }
        
        const formattedContent = messages
          .map((msg: any, idx: number) => {
            const role = msg.info?.role || "unknown";
            
            // Extract content from parts array
            let content = "";
            if (Array.isArray(msg.parts)) {
              content = msg.parts
                .map((part: any) => {
                  // Extract text from text-type parts
                  if (part.type === "text" && part.text) {
                    return part.text;
                  }
                  // Extract tool command and output
                  if (part.type === "tool" && part.state) {
                    const cmd = part.state.input?.command || "";
                    const output = part.state.output || "";
                    const desc = part.state.input?.description || "";
                    if (desc || cmd || output) {
                      return `[Tool: ${part.tool || "unknown"}]\n${desc}\nCommand: ${cmd}\nOutput: ${output}`;
                    }
                  }
                  return "";
                })
                .filter((text: string) => text.trim().length > 0)
                .join("\n\n");
            }
            
            // Note: Cannot use async log() here in map()
            return `[${role}]\n${content}`;
          })
          .join("\n\n---\n\n");

        if (ENABLE_LOGGING) {
          await log(`Formatted content length: ${formattedContent.length}`);
        }
        
        if (!formattedContent.trim()) {
          if (ENABLE_LOGGING) {
            await log("ERROR: Empty formatted content, skipping");
          }
          return;
        }

        // Send to Iris inbox using scripts/inbox_write.sh
        // Escape single quotes for shell command
        const escapedContent = formattedContent.replace(/'/g, "'\\''");
        if (ENABLE_LOGGING) {
          await log("Sending to Iris inbox...");
        }
        
        await $`scripts/inbox_write.sh iris noctis noctis_idle_capture '${escapedContent}'`.quiet();
        
        if (ENABLE_LOGGING) {
          await log(`SUCCESS: Sent ${messages.length} messages to Iris inbox`);
        }
      } catch (err) {
        if (ENABLE_LOGGING) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          const errorStack = err instanceof Error ? err.stack : "";
          await log(`ERROR: Capture failed: ${errorMsg}`);
          if (errorStack) {
            await log(`Stack trace: ${errorStack}`);
          }
        }
      }
    },
  };
};

export default NoctisIdleCapture;
