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
        "relative overflow-hidden rounded-xl border p-5 shadow-card",
        primary ? "bg-ledger border-transparent text-primary-foreground" : "bg-card",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className={cn("text-xs font-semibold uppercase tracking-[0.14em]", primary ? "text-primary-foreground/75" : "text-muted-foreground")}>
          {label}
        </p>
        {icon && <span className={cn("[&_svg]:size-4", primary ? "text-highlight" : "text-primary")}>{icon}</span>}
      </div>
      <div className="figure mt-3 text-3xl font-semibold">
        {loading ? <span className="inline-block h-8 w-28 animate-pulse rounded bg-current opacity-15" /> : value}
      </div>
      {hint && <div className={cn("mt-2 text-sm", primary ? "text-primary-foreground/80" : "text-muted-foreground")}>{hint}</div>}
    </div>
  );
}
