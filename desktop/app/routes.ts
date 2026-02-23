import { type RouteConfig, route, layout, index } from "@react-router/dev/routes";

export default [
  // API routes — server-only, no layout wrapper
  route("api/dashboard", "routes/api.dashboard.ts"),
  route("api/inbox/:agent", "routes/api.inbox.$agent.ts"),
  route("api/chat-logs", "routes/api.chat-logs.ts"),
  route("api/inbox-log", "routes/api.inbox-log.ts"),
  route("api/health", "routes/api.health.ts"),
  route("api/projects", "routes/api.projects.ts"),
  route("api/projects/active", "routes/api.projects.active.ts"),
  route("api/slash-suggestions", "routes/api.slash-suggestions.ts"),
  route("api/at-suggestions", "routes/api.at-suggestions.ts"),
  route("api/model-options", "routes/api.model-options.ts"),
  route("api/model-switch", "routes/api.model-switch.ts"),
  route("api/current-model", "routes/api.current-model.ts"),
  route("api/session-create", "routes/api.session-create.ts"),
  route("api/session-clear-all", "routes/api.session-clear-all.ts"),
  route("api/open-folder", "routes/api.open-folder.ts"),
  route("api/reports", "routes/api.reports.ts"),
  route("api/report", "routes/api.report.ts"),
  // UI routes
  layout("routes/_layout.tsx", [
    index("routes/index.tsx"),
    route("dashboard", "routes/dashboard.tsx"),
    route("messages/noctis", "routes/messages.noctis.tsx"),
    route("messages/lunafreya", "routes/messages.lunafreya.tsx"),
    route("chat", "routes/chat.tsx"),
    route("health", "routes/health.tsx"),
    route("projects", "routes/projects.tsx"),
    route("reports", "routes/reports.tsx"),
  ]),
] satisfies RouteConfig;
