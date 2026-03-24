---
applyTo: "web/**/*.{ts,tsx,css}"
---

# multi-agent-ff15 web app instructions

- Build within the existing stack: React Router 7 file-based routes, React 19, TypeScript, Tailwind CSS v4, Radix UI, and Zustand. Do not introduce a new router, styling system, or global state library for normal feature work.
- Keep route code under `web/app/routes`. Follow the existing flat-routes naming scheme: `_layout.*` for layout groups, `$param` for dynamic segments, and route-local `components/` folders for UI that is specific to one route subtree.
- Keep server-only logic in `.server.ts` or `.server.tsx` modules. Filesystem access, YAML parsing, process execution, and project-root resolution must stay on the server side.
- For repo-root config access, call `getProjectRoot()` and use the existing helpers in `web/app/lib` before adding new file access code. When updating `config/settings.yaml`, preserve unknown keys by following the `yaml.parseDocument()` pattern already used in `app-config.server.ts`.
- Use React Router `loader()` and `action()` exports or `routes/api.*.ts` handlers for server-backed data flows. Return `Response.json(...)` with explicit error status codes instead of ad hoc response shapes.
- Reuse existing UI primitives from `web/app/components/ui` and merge classes with `cn()` from `web/app/lib/utils.ts`. Prefer extending existing patterns over creating one-off wrappers.
- Keep shared cross-route client state in the existing Zustand stores under `web/app/stores`. Keep route-specific UI state local to the route/component unless multiple screens truly need shared state.
- Import generated route types from the local `./+types/...` module when working inside route files, and preserve the current TypeScript/Biome style: 2-space indentation, semicolons, trailing commas where Biome expects them.
- Add tests next to the affected server/helper code as `*.test.ts` or `*.test.tsx` when behavior changes. For meaningful web changes, validate with `npm run typecheck`, `npm run test`, and `npm run lint` in `web/` when relevant.