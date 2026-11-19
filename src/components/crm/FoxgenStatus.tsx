import { Badge } from "@/components/ui/badge";
import { isBot } from "@/lib/foxgen-orders";
import { canonicalStatus } from "@/lib/foxgen-marketplace";

export function FoxgenStatus({ status }: { status: string }) {
  status = canonicalStatus(status);
  const variant =
    status === "delivered" || ["payment_confirmed", "approved"].includes(status)
      ? "success"
      : ["rejected", "cancelled", "expired", "delayed", "failed"].includes(status)
        ? "danger"
        : ["refunded", ""].includes(status)
          ? "muted"
          : "warning";
  return (
    <Badge variant={variant} className="foxgen-state">
      {status.replaceAll("_", " ") || "Unknown"}
    </Badge>
  );
}
export function FoxgenSource({ data }: { data: Record<string, unknown> }) {
  const source = String(data["channel"] ?? data["source"] ?? "").toLowerCase();
  return (
    <Badge variant={isBot(data) ? "bot" : "muted"}>
      {isBot(data) ? "Telegram bot" : source === "website" ? "Website" : "Unknown"}
    </Badge>
  );
}
