import { spawnSync } from "node:child_process";

/**
 * GET /api/tmux-panes
 * Returns tmux pane contents mirroring the Tauri `get_tmux_panes` command.
 */
export function loader() {
  try {
    const agents = [
      "noctis",
      "lunafreya",
      "ignis",
      "gladiolus",
      "prompto",
      "iris",
    ];
    const panes = [];

    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i];
      const target = `ff15:main.${i}`;
      const result = spawnSync(
        "tmux",
        ["capture-pane", "-t", target, "-p", "-e"],
        { encoding: "utf-8" }
      );

      if (result.status === 0) {
        panes.push({
          name: agent,
          content: result.stdout,
        });
      } else {
        panes.push({
          name: agent,
          content: "ERROR: Pane not found or tmux not running.",
        });
      }
    }

    return Response.json(panes);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
