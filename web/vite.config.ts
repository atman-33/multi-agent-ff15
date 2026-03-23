/// <reference types="vitest/config" />

import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [reactRouter(), tsconfigPaths(), tailwindcss()],
  test: {
    environment: "node",
    include: ["app/**/*.test.{ts,tsx}"],
  },
});
