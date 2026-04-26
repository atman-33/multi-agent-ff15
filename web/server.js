import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createRequestHandler } from "@react-router/express";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = path.dirname(currentFilePath);
const clientDirPath = path.join(currentDirPath, "build", "client");
const assetsDirPath = path.join(clientDirPath, "assets");
const port = Number(process.env.PORT || 3000);
const build = await import("./build/server/index.js");

const app = express();

app.disable("x-powered-by");

app.use(
  "/assets",
  express.static(assetsDirPath, {
    immutable: true,
    maxAge: "1y",
  }),
);

app.use(express.static(clientDirPath));
app.use(createRequestHandler({ build }));

app.listen(port, () => {
  console.log(`Web server is running on http://localhost:${port}`);
});