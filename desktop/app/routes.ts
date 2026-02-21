import { type RouteConfig, route, layout, index } from "@react-router/dev/routes";

export default [
  // API routes — server-only, no layout wrapper
  route("api/dashboard", "routes/api.dashboard.ts"),
  route("api/inbox/:agent", "routes/api.inbox.$agent.ts"),
  route("api/chat-logs", "routes/api.chat-logs.ts"),
  route("api/health", "routes/api.health.ts"),
  // UI routes
  layout("routes/_layout.tsx", [
    index("routes/index.tsx"),
    route("dashboard", "routes/dashboard.tsx"),
    route("messages/noctis", "routes/messages.noctis.tsx"),
    route("messages/lunafreya", "routes/messages.lunafreya.tsx"),
    route("chat", "routes/chat.tsx"),
    route("health", "routes/health.tsx"),
  ]),
] satisfies RouteConfig;
