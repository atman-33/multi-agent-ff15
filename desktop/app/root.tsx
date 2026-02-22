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
import "./app.css";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Multi-Agent FF15</title>
        <meta name="description" content="Multi-agent parallel development framework powered by OpenCode + tmux, inspired by FINAL FANTASY XV." />
        <meta name="theme-color" content="#0f172a" />
        <link rel="icon" type="image/x-icon" href="/favicons/favicon.ico" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicons/favicon-16x16.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicons/favicon-32x32.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/favicons/apple-touch-icon.png" />
        <link rel="manifest" href="/favicons/site.webmanifest" />
        <Meta />
        <Links />
      </head>
      <body className="flex flex-col h-screen overflow-hidden">
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

