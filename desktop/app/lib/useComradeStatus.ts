// ---------------------------------------------------------------------------
// Types & constants shared across Comrade-related components.
// Busy-state computation lives in chat.tsx (unified with Noctis / Lunafreya).
// ---------------------------------------------------------------------------

export const COMRADES = ["ignis", "gladiolus", "prompto", "iris"] as const;
export type ComradeId = (typeof COMRADES)[number];

export const COMRADE_CONFIG: Record<
  ComradeId,
  { label: string; imageSrc: string }
> = {
  ignis: { label: "Ignis", imageSrc: "/images/ignis.png" },
  gladiolus: { label: "Gladiolus", imageSrc: "/images/gladiolus.png" },
  prompto: { label: "Prompto", imageSrc: "/images/prompto.png" },
  iris: { label: "Iris", imageSrc: "/images/iris.png" },
};

