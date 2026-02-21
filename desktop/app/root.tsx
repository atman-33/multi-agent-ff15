import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
} from "react-router";
import type { Route } from "./+types/root";
import { Toaster } from "sonner";
import { TitleBar } from "@/components/ui/titlebar";
import "./app.css";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="flex flex-col h-screen overflow-hidden">
        {/* Custom titlebar — replaces native OS titlebar */}
        <div className="bg-card/80 border-b border-border/50 backdrop-blur-sm shrink-0 z-50">
          <TitleBar />
        </div>
        {/* Page content */}
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
        <Toaster
          position="bottom-right"
          richColors
          theme="dark"
          toastOptions={{
            style: {
              background: "hsl(222 38% 10%)",
              border: "1px solid hsl(217 28% 18%)",
              color: "hsl(215 20% 93%)",
            },
          }}
        />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function Root() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "An unexpected error occurred.";
  let details = "";

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "Page not found" : "Error";
    details = error.statusText || error.data?.toString() || "";
  } else if (error instanceof Error) {
    message = "Application Error";
    details = error.message;
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center p-8">
        <h1 className="text-2xl font-bold text-destructive mb-2">{message}</h1>
        {details && (
          <p className="text-muted-foreground">{details}</p>
        )}
      </div>
    </div>
  );
}

