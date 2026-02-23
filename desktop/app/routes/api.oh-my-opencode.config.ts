import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ActionFunctionArgs } from "react-router";

const CONFIG_PATH = join(homedir(), ".config/opencode/oh-my-opencode.json");

export function loader() {
  let isInstalled = false;
  let version = "";
  try {
    version = execSync("oh-my-opencode --version", {
      encoding: "utf-8",
    }).trim();
    isInstalled = true;
  } catch (_e) {
    // Not installed
  }

  if (!existsSync(CONFIG_PATH)) {
    return Response.json({
      isInstalled,
      version,
      config: null,
      error: `Configuration file not found at ${CONFIG_PATH}`,
    });
  }

  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const config = JSON.parse(raw);
    return Response.json({ isInstalled, version, config });
  } catch (e) {
    return Response.json({
      isInstalled,
      version,
      config: null,
      error: `Failed to parse config: ${String(e)}`,
    });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    let config: any;
    const contentType = request.headers.get("Content-Type");

    if (contentType?.includes("application/json")) {
      const body = await request.json();
      config = body.config;
    } else {
      const formData = await request.formData();
      const configStr = formData.get("config");
      if (typeof configStr === "string") {
        config = JSON.parse(configStr);
      }
    }

    if (!config) {
      return Response.json(
        { error: "Missing config in request body" },
        { status: 400 }
      );
    }

    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
