import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { fetchBalance } from "@/lib/crm.functions";
import { balanceLevel, formatMoney } from "@/lib/pricing";
import { useSettings } from "@/lib/crm-queries";
import { settingNumber } from "@/lib/settings-keys";

export function useBalance() {
  const fn = useServerFn(fetchBalance);
  return useQuery({ queryKey: ["balance"], queryFn: () => fn({ data: { force: false } }), staleTime: 5 * 60 * 1000 });
}

/** Banner shown across the app when supplier balance is low. */
export function BalanceAlert() {
  const { data } = useBalance();
  const { data: s } = useSettings();
  if (!data || data.balance === null || !s) return null;
  const level = balanceLevel(data.balance, settingNumber(s, "low_balance_threshold"), settingNumber(s, "critical_balance_threshold"));
  if (level === "ok") return null;
  const critical = level === "critical";
  return (
    <div
      role="alert"
      className={
        critical
          ? "mb-6 flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          : "mb-6 flex items-center gap-3 rounded-xl border border-warning/40 bg-warning/20 px-4 py-3 text-sm text-warning-foreground"
      }
    >
      {critical ? <ShieldAlert className="size-5 shrink-0" /> : <AlertTriangle className="size-5 shrink-0" />}
      <span>
        <b>{critical ? "Critical:" : "Low balance:"}</b> supplier balance is{" "}
        <span className="figure font-semibold">{formatMoney(data.balance, s.currency_symbol)}</span>. Top up to keep bot orders running.
      </span>
    </div>
  );
}
