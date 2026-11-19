import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "primary";
  loading?: boolean;
}

export function StatCard({ label, value, hint, icon, tone = "default", loading }: Props) {
  const primary = tone === "primary";
  return (
    <div
      className={cn(
        "min-w-0 rounded-lg border bg-card p-3.5 shadow-card sm:p-4",
        primary && "border-primary/25",
      )}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <p className="text-xs font-bold leading-4 text-muted-foreground">{label}</p>
        {icon && (
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-accent text-primary [&_svg]:size-4">
            {icon}
          </span>
        )}
      </div>
      <div
        className={cn(
          "figure mt-2 min-h-8 break-words text-2xl font-extrabold",
          primary && "text-primary",
        )}
      >
        {loading ? (
          <span className="inline-block h-6 w-16 max-w-full animate-pulse rounded bg-muted" />
        ) : (
          value
        )}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
