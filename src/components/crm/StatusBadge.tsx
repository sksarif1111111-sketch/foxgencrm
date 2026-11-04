import { Badge } from "@/components/ui/badge";

export function StatusBadge({ status }: { status: string }) {
  const variant = status === "completed" ? "success" : status === "pending" ? "warning" : "danger";
  return (
    <Badge variant={variant} className="capitalize">
      {status}
    </Badge>
  );
}

export function SourceBadge({ source }: { source: string }) {
  return <Badge variant={source === "manual" ? "manual" : "bot"}>{source === "manual" ? "Manual" : "Bot"}</Badge>;
}
