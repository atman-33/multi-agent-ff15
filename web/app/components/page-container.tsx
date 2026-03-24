import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageContainerSize = "narrow" | "medium" | "wide";

const SIZE_CLASS_NAMES: Record<PageContainerSize, string> = {
  narrow: "max-w-3xl",
  medium: "max-w-4xl",
  wide: "max-w-5xl",
};

interface PageContainerProps {
  children: ReactNode;
  className?: string;
  size?: PageContainerSize;
}

export function PageContainer({
  children,
  className,
  size = "medium",
}: PageContainerProps) {
  return (
    <div className="h-full min-h-0 overflow-hidden">
      <div
        className={cn(
          "mx-auto flex h-full min-h-0 w-full flex-col overflow-auto p-6",
          SIZE_CLASS_NAMES[size],
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}
