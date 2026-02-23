import { execSync } from "node:child_process";

export async function loader() {
  try {
    const output = execSync("opencode models", { encoding: "utf-8" });
    const models = output
      .split("\n")
      .map((line) => line.trim())
      .filter(
        (line) => line && !line.startsWith("opencode") && !line.includes("--")
      );

    return Response.json({ models });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
