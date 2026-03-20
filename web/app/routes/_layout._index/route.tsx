import { redirect } from "react-router";
import type { Route } from "./+types/route";

const IndexPage = () => {
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
      return {};
    }
    const data = (await response.json()) as { sessions: Array<{ id: string }> };
    const firstSession = data.sessions?.[0];
    if (firstSession?.id) {
      return redirect(`/session/${firstSession.id}`);
    }
    return {};
  } catch {
    return {};
  }
};

export default IndexPage;
