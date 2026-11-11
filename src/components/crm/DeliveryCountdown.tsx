import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { clockRunning, deliveryClock, timestamp } from "@/lib/foxgen-orders";
import { cn } from "@/lib/utils";

export function DeliveryCountdown({
  confirmedAt,
  slaMinutes,
  deliveredAt,
  status,
}: {
  confirmedAt: unknown;
  slaMinutes?: unknown;
  deliveredAt?: unknown;
  status: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  const active = clockRunning(status) && timestamp(deliveredAt) === null;
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, [active, confirmedAt]);
  if (!active && timestamp(deliveredAt) === null) return null;
  const clock = deliveryClock(confirmedAt, slaMinutes, deliveredAt, now);
  if (!clock) return null;
  return (
    <Badge
      variant={clock.zone}
      className={cn(
        "figure foxgen-state whitespace-nowrap tracking-normal",
        clock.overdue && "foxgen-overdue",
      )}
    >
      {clock.label}
    </Badge>
  );
}
