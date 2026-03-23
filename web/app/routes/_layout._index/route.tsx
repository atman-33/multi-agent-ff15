import { redirect } from "react-router";
import type { Route } from "./+types/route";

export const loader = async (_args: Route.LoaderArgs) => {
  return redirect("/noctis-team");
};

export default function IndexPage() {
  return null;
}
