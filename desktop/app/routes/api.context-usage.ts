import { spawnSync } from "node:child_process";
import { AGENT_PANE_INDEX, ALL_MODEL_SWITCH_AGENTS } from "@/lib/agents";

const ESC = "\x1b";
const CSI = "\x9b";
const ANSI_REGEX = new RegExp(
  `[${ESC}${CSI}][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]`,
  "g"
);

const CONTEXT_LINE_REGEX = /\d+%.*\(\$/;
const PERCENT_REGEX = /(\d+)%/;

function extractContextPercent(rawContent: string): number | null {
  const clean = rawContent.replace(ANSI_REGEX, "");
  const sessionLine = clean
    .split("\n")
    .reverse()
    .find((line: string) => CONTEXT_LINE_REGEX.test(line));
  if (!sessionLine) {
    return null;
  }
  const match = sessionLine.match(PERCENT_REGEX);
  if (!match) {
    return null;
  }
  const value = Number.parseInt(match[1], 10);
  return Number.isNaN(value) ? null : value;
}

export function loader() {
  try {
    const result: Record<string, number | null> = {};

    for (const agent of ALL_MODEL_SWITCH_AGENTS) {
      const paneIndex = AGENT_PANE_INDEX[agent];
      const target = `ff15:main.${paneIndex}`;

      const capture = spawnSync(
        "tmux",
        ["capture-pane", "-t", target, "-p", "-e"],
        { encoding: "utf-8" }
      );

      if (capture.status === 0 && capture.stdout) {
        result[agent] = extractContextPercent(capture.stdout);
      } else {
        result[agent] = null;
      }
    }

    return Response.json(result);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
