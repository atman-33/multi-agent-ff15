import { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useMatch, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { buildMissionPath } from "../_layout.noctis-team/components/output-detail-routing";
import type { Route } from "./+types/route";

const OUTPUT_DETAIL_ROUTE_PATTERN = "/lunafreya/mission/:id/output/:step/:taskId/:filename";
const SHEET_CLOSE_ANIMATION_MS = 300;

export const LunafreyaMissionPage = ({ loaderData }: Route.ComponentProps) => {
  const navigate = useNavigate();
  const params = useParams();
  const outputDetailMatch = useMatch(OUTPUT_DETAIL_ROUTE_PATTERN);
  const closeTimeoutRef = useRef<number | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const missionId = params.id ?? loaderData.requestedMissionId ?? null;
  const isOutputDetailShowing = Boolean(outputDetailMatch);

  useEffect(() => {
    if (loaderData.exists) {
      return;
    }

    toast.error("Mission not found", {
      description: loaderData.requestedMissionId
        ? `Mission ${loaderData.requestedMissionId} could not be restored.`
        : "The selected mission could not be restored.",
    });
    navigate("/lunafreya", { replace: true });
  }, [loaderData.exists, loaderData.requestedMissionId, navigate]);

  useEffect(() => {
    if (!isOutputDetailShowing) {
      return;
    }

    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }

    setIsSheetOpen(true);
  }, [isOutputDetailShowing]);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  const closeDetail = useCallback(() => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
    }

    setIsSheetOpen(false);
    closeTimeoutRef.current = window.setTimeout(() => {
      closeTimeoutRef.current = null;
      navigate(missionId ? buildMissionPath(missionId, "/lunafreya") : "/lunafreya");
    }, SHEET_CLOSE_ANIMATION_MS);
  }, [missionId, navigate]);

  if (!isOutputDetailShowing) {
    return <Outlet />;
  }

  return (
    <Sheet
      onOpenChange={(open) => (!open ? closeDetail() : setIsSheetOpen(true))}
      open={isSheetOpen}
    >
      <SheetContent
        className="w-[98vw] max-w-[98vw] p-0 sm:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl"
        showCloseButton={false}
      >
        <Outlet />
      </SheetContent>
    </Sheet>
  );
};

export const loader = async ({ params, request }: Route.LoaderArgs) => {
  const requestedMissionId = params.id ?? null;
  if (!requestedMissionId) {
    return { exists: false, requestedMissionId };
  }

  try {
    const url = new URL(request.url);
    const response = await fetch(`${url.origin}/api/lunafreya/missions/${requestedMissionId}`);
    return {
      exists: response.ok,
      requestedMissionId,
    };
  } catch {
    return {
      exists: false,
      requestedMissionId,
    };
  }
};

export default LunafreyaMissionPage;