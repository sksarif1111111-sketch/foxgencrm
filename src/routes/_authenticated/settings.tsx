import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { Bot, Link2, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/crm/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSettings } from "@/lib/crm-queries";
import { SettingsSchema } from "@/lib/validators";
import { settingBool, settingNumber } from "@/lib/settings-keys";
import { botStatus, registerWebhook, sendOwnerTest } from "@/lib/crm.functions";
import { FoxgenConnectionCard } from "@/components/crm/FoxgenMetrics";
import { StoreSyncKeySettings } from "@/components/crm/StoreSyncKeySettings";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [
    { title: "Settings \u2014 Digital Store CRM" },
    { name: "description", content: "Manage store settings, payment details and Telegram owner alerts." },
    { property: "og:title", content: "Settings \u2014 Digital Store CRM" },
    { property: "og:description", content: "Manage store settings, payment details and Telegram owner alerts." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: SettingsPage,
});

type FormIn = z.input<typeof SettingsSchema>;
type FormOut = z.output<typeof SettingsSchema>;

function SettingsPage() {
  const qc = useQueryClient();
  const { data: s } = useSettings();
  const form = useForm<FormIn, unknown, FormOut>({ resolver: zodResolver(SettingsSchema) });
  const { register, handleSubmit, reset, watch, setValue, formState } = form;

  useEffect(() => {
    if (!s) return;
    reset({
      store_name: s.store_name,
      currency_symbol: s.currency_symbol,
      default_markup_percentage: settingNumber(s, "default_markup_percentage"),
      low_balance_threshold: settingNumber(s, "low_balance_threshold"),
      critical_balance_threshold: settingNumber(s, "critical_balance_threshold"),
      upi_id: s.upi_id,
      binance_pay_id: s.binance_pay_id,
      crypto_wallet: s.crypto_wallet,
      crypto_network: s.crypto_network,
      owner_telegram_chat_id: s.owner_telegram_chat_id,
      owner_email: s.owner_email,
      support_contact: s.support_contact,
      bot_paused: settingBool(s, "bot_paused"),
      auto_deliver: settingBool(s, "auto_deliver"),
    });
  }, [s, reset]);

  async function onSubmit(v: FormOut) {
    const now = new Date().toISOString();
    const rows = Object.entries(v).map(([key, value]) => ({ key, value: String(value), updated_at: now }));
    const { error } = await supabase.from("settings").upsert(rows);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Settings saved");
    qc.invalidateQueries({ queryKey: ["settings"] });
  }

  const err = formState.errors;
  return (
    <>
      <PageHeader title="Settings" description="Store details, payment instructions, alerts and the Telegram bot." />
      <div className="mb-6"><StoreSyncKeySettings /></div>
      <div className="grid gap-6 lg:grid-cols-3">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 lg:col-span-2">
          <Section title="Store">
            <Field label="Store name" error={err.store_name?.message}>
              <Input {...register("store_name")} />
            </Field>
            <Field label="Currency symbol">
              <Input {...register("currency_symbol")} className="max-w-[100px]" />
            </Field>
            <Field label="Default markup %">
              <Input type="number" min={0} {...register("default_markup_percentage")} className="max-w-[140px]" />
            </Field>
            <Field label="Support contact (shown to customers)">
              <Input placeholder="@yourusername" {...register("support_contact")} />
            </Field>
          </Section>

          <Section title="Payment details shown in the bot" description="Leave a method empty to hide it from customers.">
            <Field label="UPI ID">
              <Input placeholder="yourname@bank" {...register("upi_id")} />
            </Field>
            <Field label="Binance Pay ID">
              <Input {...register("binance_pay_id")} />
            </Field>
            <Field label="Crypto wallet address">
              <Input {...register("crypto_wallet")} />
            </Field>
            <Field label="Crypto network">
              <Input placeholder="USDT (TRC20)" {...register("crypto_network")} />
            </Field>
          </Section>

          <Section title="Order handling">
            <ToggleRow
              label="Instant delivery after proof format check"
              description="Off: you approve each bot order (in Telegram or here) before accounts are sent. On: accounts are sent as soon as the transaction ID format looks valid — this cannot confirm the money actually arrived."
              checked={!!watch("auto_deliver")}
              onChange={(v) => setValue("auto_deliver", v, { shouldDirty: true })}
            />
            <ToggleRow
              label="Pause bot sales"
              description="Customers see “temporarily unavailable”. Turned on automatically when supplier balance runs out."
              checked={!!watch("bot_paused")}
              onChange={(v) => setValue("bot_paused", v, { shouldDirty: true })}
            />
          </Section>

          <Section title="Alerts">
            <Field label="Your Telegram chat ID" error={err.owner_telegram_chat_id?.message} hint="Send /myid to your bot to get it. New-order and low-balance alerts go here.">
              <Input inputMode="numeric" {...register("owner_telegram_chat_id")} />
            </Field>
            <Field label="Owner email">
              <Input type="email" {...register("owner_email")} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Low balance warning below">
                <Input type="number" min={0} {...register("low_balance_threshold")} />
              </Field>
              <Field label="Critical alert below">
                <Input type="number" min={0} {...register("critical_balance_threshold")} />
              </Field>
            </div>
          </Section>

          <Button type="submit" size="lg" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? "Saving…" : "Save settings"}
          </Button>
        </form>

        <div className="space-y-6">
          <FoxgenConnectionCard />
          <BotCard />
          <ApiLog />
        </div>
      </div>
    </>
  );
}

function BotCard() {
  const status = useServerFn(botStatus);
  const register = useServerFn(registerWebhook);
  const test = useServerFn(sendOwnerTest);
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ["bot-status"], queryFn: () => status() });
  const d = q.data;
  const connected = !!d?.webhookUrl && d.webhookUrl.includes("/api/public/telegram/webhook");

  async function connect(target: "preview" | "live") {
    setBusy(true);
    const r = await register({ data: { target } });
    setBusy(false);
    r.ok ? toast.success("Bot connected") : toast.error(r.error ?? "Failed");
    q.refetch();
  }

  return (
    <div className="rounded-xl border bg-card p-5 shadow-card">
      <h2 className="flex items-center gap-2 font-bold">
        <Bot className="size-4 text-primary" /> Telegram bot
      </h2>
      {q.isLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">Checking…</p>
      ) : d?.ok ? (
        <div className="mt-3 space-y-2 text-sm">
          <p>
            <a className="font-semibold text-primary hover:underline" href={`https://t.me/${d.username}`} target="_blank" rel="noreferrer">
              @{d.username}
            </a>{" "}
            · {d.name}
          </p>
          <p className="flex items-center gap-2">
            Status: {connected ? <Badge variant="success">Receiving messages</Badge> : <Badge variant="warning">Not connected</Badge>}
          </p>
          {d.webhookUrl && <p className="break-all text-xs text-muted-foreground">{d.webhookUrl.includes("-dev.") ? "Using the preview version" : "Using the published version"}</p>}
          {d.lastError && <p className="text-xs text-destructive">Last delivery error: {d.lastError}</p>}
        </div>
      ) : (
        <p className="mt-3 text-sm text-destructive">{d?.error ?? "Bot unreachable"}</p>
      )}
      <div className="mt-4 flex flex-col gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => connect("preview")}>
          <Link2 /> Connect bot to preview
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => connect("live")}>
          <Link2 /> Connect bot to published app
        </Button>
        <Button
          variant="ghost"
          onClick={async () => {
            const r = await test();
            r.ok ? toast.success("Test alert sent to your Telegram") : toast.error(r.error ?? "Failed");
          }}
        >
          <Send /> Send test alert to me
        </Button>
      </div>
    </div>
  );
}

function ApiLog() {
  const q = useQuery({
    queryKey: ["api-log"],
    queryFn: async () => {
      const { data, error } = await supabase.from("api_calls_log").select("*").order("created_at", { ascending: false }).range(0, 14);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  return (
    <div className="rounded-xl border bg-card p-5 shadow-card">
      <h2 className="font-bold">Supplier API activity</h2>
      {!q.data?.length ? (
        <p className="mt-3 text-sm text-muted-foreground">No calls yet.</p>
      ) : (
        <ul className="mt-3 space-y-2 text-xs">
          {q.data.map((l) => (
            <li key={l.id} className="flex items-start justify-between gap-2 border-b border-dashed pb-2 last:border-0">
              <span>
                <Badge variant={l.success ? "success" : "danger"}>{l.action}</Badge>
                {l.error && <span className="ml-2 text-destructive">{l.error}</span>}
              </span>
              <span className="figure shrink-0 text-muted-foreground">{format(new Date(l.created_at), "dd MMM HH:mm")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5 shadow-card">
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, error, children }: { label: string; hint?: string | undefined; error?: string | undefined; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}
