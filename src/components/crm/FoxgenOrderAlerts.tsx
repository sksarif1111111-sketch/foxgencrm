import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { foxgenWorkspaceOptions } from "@/lib/foxgen-queries";
import { newOrderAlerts } from "@/lib/foxgen-alerts";
import { needsReview } from "@/lib/foxgen-workspace";
import { orderData } from "@/lib/foxgen-orders";

export function FoxgenOrderAlerts() {
  const q = useQuery({ ...foxgenWorkspaceOptions, refetchIntervalInBackground: true });
  const previous = useRef<Map<string, boolean> | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const [enabled, setEnabled] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    if (!q.data) return;
    const arrivals = previous.current ? newOrderAlerts(previous.current, q.data) : [];
    previous.current = new Map(q.data.map((order) => [order.external_id, needsReview(order)]));
    for (const order of arrivals.slice(0, 3)) {
      const number = String(orderData(order.data)["order_number"] ?? order.external_id);
      const title = needsReview(order)
        ? `Payment waiting for approval · ${number}`
        : `New Store order · ${number}`;
      toast.info(title, {
        action: {
          label: "Open order",
          onClick: () =>
            void navigate({ to: "/foxgen-orders/$id", params: { id: order.external_id } }),
        },
      });
      if (enabled && "Notification" in window && Notification.permission === "granted")
        new Notification(title, { tag: `foxgen-${order.external_id}` });
    }
    if (enabled && arrivals.length && audio.current) {
      const context = audio.current;
      void context
        .resume()
        .then(() => {
          for (const [index, frequency] of [660, 880].entries()) {
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.frequency.value = frequency;
            gain.gain.value = 0.08;
            oscillator.connect(gain);
            gain.connect(context.destination);
            const at = context.currentTime + index * 0.18;
            gain.gain.setValueAtTime(0.08, at);
            gain.gain.exponentialRampToValueAtTime(0.001, at + 0.16);
            oscillator.start(at);
            oscillator.stop(at + 0.17);
          }
        })
        .catch(() => {});
    }
  }, [q.data, enabled, navigate]);
  useEffect(
    () => () => {
      void audio.current?.close();
    },
    [],
  );
  async function toggle() {
    if (enabled) {
      setEnabled(false);
      return;
    }
    try {
      audio.current ??= new AudioContext();
      await audio.current.resume();
    } catch {
      toast.info(
        "Sound is unavailable in this browser; on-screen order notifications remain active.",
      );
    }
    if ("Notification" in window && Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch {
        /* Browser can block system notifications in embedded previews. */
      }
    }
    setEnabled(true);
  }
  return (
    <Button
      variant="ghost"
      size="icon"
      className="shrink-0"
      aria-label={enabled ? "Disable order alerts" : "Enable order alerts"}
      title={enabled ? "Disable order alerts" : "Enable order alerts"}
      aria-pressed={enabled}
      onClick={toggle}
    >
      {enabled ? <Bell className="text-primary" /> : <BellOff />}
    </Button>
  );
}
