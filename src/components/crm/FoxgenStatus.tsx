import { Badge } from "@/components/ui/badge";
import { isBot } from "@/lib/foxgen-orders";
import { canonicalStatus } from "@/lib/foxgen-marketplace";

export function FoxgenStatus({ status }: { status: string }) {
  status = canonicalStatus(status);
  const variant =
    status === "delivered" || status === "payment_confirmed"
      ? "success"
      : ["rejected", "cancelled", "expired", "delayed"].includes(status)
        ? "danger"
        : "warning";
  return (
    <Badge variant={variant} className="foxgen-state">
      {status.replaceAll("_", " ") || "Unknown"}
    </Badge>
  );
}
export function FoxgenSource({ data }: { data: Record<string, unknown> }) {
  return <Badge variant={isBot(data) ? "bot" : "manual"}>{isBot(data) ? "Bot" : "Website"}</Badge>;
}
