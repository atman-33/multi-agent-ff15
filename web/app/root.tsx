import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import { Toaster } from "sonner";
import type { Route } from "./+types/root";
import "./app.css";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Multi-Agent FF15</title>
        <meta
          name="description"
          content="Multi-agent parallel development framework powered by OpenCode, inspired by FINAL FANTASY XV."
        />
        <meta name="theme-color" content="#0f172a" />
        <link href="/favicons/favicon.ico" rel="icon" type="image/x-icon" />
        <link href="/favicons/favicon-16x16.png" rel="icon" sizes="16x16" type="image/png" />
        <link href="/favicons/favicon-32x32.png" rel="icon" sizes="32x32" type="image/png" />
        <link href="/favicons/apple-touch-icon.png" rel="apple-touch-icon" sizes="180x180" />
        <link href="/favicons/site.webmanifest" rel="manifest" />
        <Meta />
        <Links />
      </head>
      <body className="flex h-screen flex-col overflow-hidden">
        <div className="flex-1 overflow-hidden">{children}</div>
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

export default function App() {
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
    <div className="flex min-h-screen items-center justify-center">
      <div className="p-8 text-center">
        <h1 className="mb-2 font-bold text-2xl text-destructive">{message}</h1>
        {details && <p className="text-muted-foreground">{details}</p>}
      </div>
    </div>
  );
}
