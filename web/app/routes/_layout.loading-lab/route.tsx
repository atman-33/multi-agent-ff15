import { Clock3, Footprints, Rabbit } from "lucide-react";
import { NavLink } from "react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Route } from "./+types/route";

const DEFAULT_DELAY_MS = 2400;
const MIN_DELAY_MS = 400;
const MAX_DELAY_MS = 8000;

const PRESET_DELAYS = [900, 1800, 3200, 5000] as const;

const wait = (durationMs: number) => new Promise((resolve) => setTimeout(resolve, durationMs));

const parseDelay = (rawValue: string | null) => {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_DELAY_MS;
  }

  return Math.min(Math.max(Math.round(parsed), MIN_DELAY_MS), MAX_DELAY_MS);
};

export const loader = async ({ request }: Route.LoaderArgs) => {
  const url = new URL(request.url);
  const delayMs = parseDelay(url.searchParams.get("delay"));

  await wait(delayMs);

  return {
    delayMs,
    loadedAt: new Date().toISOString(),
  };
};

const LoadingLabPage = ({ loaderData }: Route.ComponentProps) => {
  return (
    <div className="relative flex h-full min-h-0 overflow-auto bg-gradient-to-br from-stone-950 via-stone-900 to-amber-950/45">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
        <section className="overflow-hidden rounded-[28px] border border-amber-200/15 bg-black/25 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-sm">
          <div className="border-b border-amber-100/10 bg-gradient-to-r from-amber-400/12 via-amber-200/6 to-transparent px-6 py-5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-300/10 text-amber-100">
                <Rabbit className="h-5 w-5" />
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-amber-50/55">
                  Preview Route
                </p>
                <h1 className="text-xl text-amber-50 md:text-2xl">Loading Lab</h1>
              </div>
            </div>
          </div>

          <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.9fr)]">
            <div className="space-y-5">
              <div className="rounded-3xl border border-amber-100/10 bg-amber-50/[0.03] p-5 text-amber-50/85">
                <p className="max-w-2xl text-sm leading-7 text-amber-50/76">
                  This page intentionally waits inside its route loader so the shared transition
                  overlay stays visible long enough to inspect. Use the presets below to trigger
                  repeated route transitions and check timing, readability, and motion.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {PRESET_DELAYS.map((delayMs) => {
                  const isActive = delayMs === loaderData.delayMs;

                  return (
                    <Button
                      key={delayMs}
                      asChild
                      className={cn(
                        "h-auto min-h-24 justify-start rounded-3xl border px-4 py-4 text-left",
                        isActive
                          ? "border-amber-300/40 bg-amber-300/16 text-amber-50 hover:bg-amber-300/22"
                          : "border-amber-100/10 bg-black/20 text-amber-50/90 hover:bg-white/7"
                      )}
                      variant="ghost"
                    >
                      <NavLink to={`/loading-lab?delay=${delayMs}`}>
                        <span className="flex w-full flex-col gap-2">
                          <span className="font-mono text-[10px] uppercase tracking-[0.26em] text-amber-50/50">
                            Preset
                          </span>
                          <span className="text-base">{(delayMs / 1000).toFixed(1)}s delay</span>
                        </span>
                      </NavLink>
                    </Button>
                  );
                })}
              </div>
            </div>

            <aside className="space-y-4 rounded-[28px] border border-amber-100/10 bg-black/20 p-5 text-amber-50/82">
              <div className="flex items-center gap-2 text-amber-50">
                <Clock3 className="h-4 w-4" />
                <h2 className="text-sm">Last Load</h2>
              </div>

              <dl className="space-y-3 text-sm">
                <div className="rounded-2xl border border-amber-100/10 bg-white/[0.03] p-3">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.24em] text-amber-50/45">
                    Simulated Delay
                  </dt>
                  <dd className="mt-1 text-lg text-amber-50">{loaderData.delayMs} ms</dd>
                </div>
                <div className="rounded-2xl border border-amber-100/10 bg-white/[0.03] p-3">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.24em] text-amber-50/45">
                    Loaded At
                  </dt>
                  <dd className="mt-1 break-all text-sm text-amber-50/86">{loaderData.loadedAt}</dd>
                </div>
              </dl>

              <div className="rounded-2xl border border-dashed border-amber-200/15 bg-amber-200/[0.04] p-4 text-sm leading-6 text-amber-50/70">
                <div className="mb-2 flex items-center gap-2 text-amber-50/90">
                  <Footprints className="h-4 w-4" />
                  <span>What to check</span>
                </div>
                <ul className="space-y-1.5">
                  <li>Overlay appears after a short delay and does not flicker.</li>
                  <li>Chocobo motion remains readable on both wide and narrow screens.</li>
                  <li>The overlay feels like a route transition, not a blocking modal.</li>
                </ul>
              </div>
            </aside>
          </div>
        </section>
      </div>
    </div>
  );
};

export default LoadingLabPage;