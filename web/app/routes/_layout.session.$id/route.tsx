import { redirect } from "react-router";
import type { Route } from "./+types/route";

export const loader = ({ params }: Route.LoaderArgs) => {
  return redirect(`/opencode/session/${params.id}`);
};

export default function SessionRedirect() {
  return null;
}
