import { type RouteConfig, route, layout, index } from "@react-router/dev/routes";

export default [
  layout("routes/_layout.tsx", [
    index("routes/index.tsx"),
    route("dashboard", "routes/dashboard.tsx"),
    route("messages/noctis", "routes/messages.noctis.tsx"),
    route("messages/lunafreya", "routes/messages.lunafreya.tsx"),
    route("unified-chat", "routes/unified-chat.tsx"),
    route("health", "routes/health.tsx"),
  ]),
] satisfies RouteConfig;
