import { Navigate } from "react-router";
import type { Route } from "./+types/route";

const IndexPage = ({ loaderData }: Route.ComponentProps) => {
  if (loaderData.redirectTo) {
    return <Navigate to={loaderData.redirectTo} replace />;
  }

  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      Create or select a session to start chatting.
    </div>
  );
};

export const loader = async ({ request }: Route.LoaderArgs) => {
  try {
    const url = new URL(request.url);
    const response = await fetch(`${url.origin}/api/sessions`);
    if (!response.ok) {
      return { redirectTo: null };
    }
    const data = (await response.json()) as { sessions: Array<{ id: string }> };
    const firstSession = data.sessions?.[0];
    if (firstSession?.id) {
      return { redirectTo: `/session/${firstSession.id}` };
    }
    return { redirectTo: null };
  } catch {
    return { redirectTo: null };
  }
};

export default IndexPage;
