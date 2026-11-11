import { Badge } from "@/components/ui/badge";
import { isBot } from "@/lib/foxgen-orders";

export function FoxgenStatus({ status }: { status: string }) {
  const variant =
    status === "delivered" || status === "payment_confirmed"
      ? "success"
      : ["rejected", "cancelled", "expired"].includes(status)
        ? "danger"
        : "warning";
  return (
    <Badge variant={variant} className="foxgen-state">
      {status || "Unknown"}
    </Badge>
  );
}
export function FoxgenSource({ data }: { data: Record<string, unknown> }) {
  return <Badge variant={isBot(data) ? "bot" : "manual"}>{isBot(data) ? "Bot" : "Website"}</Badge>;
}
