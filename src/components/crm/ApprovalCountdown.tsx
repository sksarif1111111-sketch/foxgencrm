import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { approvalClock } from "@/lib/foxgen-workspace";
import type { FoxgenOrder } from "@/lib/foxgen-orders";

export function ApprovalCountdown({ order }: { order: FoxgenOrder }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const clock = approvalClock(order, now);
  return clock ? (
    <Badge variant={clock.overdue ? "danger" : "warning"} className="figure whitespace-nowrap">
      Approval · {clock.label}
    </Badge>
  ) : null;
}
