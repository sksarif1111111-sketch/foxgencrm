import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Copy, RefreshCw, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { foxgenConnectionOptions } from "@/lib/foxgen-queries";

const syncUrl = "https://foxgencrm.lovable.app/api/public/store/sync";
const setup = `Connect FOXGEN AI STORE to the existing FoxGen CRM, preserving the Store's own checkout, wallet ledger, inventory and Telegram bot.
CRM sync URL: ${syncUrl}
Use the owner's existing inbound sync key as server-only FOXGEN_CRM_API_KEY. Never send the login password. Do not rotate the key automatically.
POST JSON { records: [...] } with Authorization: Bearer <sync key>; maximum 100 records and 256 KB per batch.
Each record: entity, external_id (stable source ID), name, status, amount, currency, updated_at (actual ISO source version), data (object).
Supported entities: orders, payments, customers, products, refunds, expenses, inventory.
Use a durable outbox after source transactions commit. Backfill existing records. Retry network errors/503 with the SAME IDs and timestamps; surface failures to the owner. Send cancellation/deletion tombstones rather than deleting history.
Send all website accounts and Telegram members as customers, with member_number, joined_at, telegram_username, telegram_user_id and snapshot wallet_balance/wallet_currency. Every order and payment must include data.customer_external_id matching the customer external_id exactly.
Orders: send channel (bot/website), order_number, customer_name, payment_method_name, payment_status, payment_reference, items, confirmed_at ONLY after verified payment, delivered_at ONLY after real delivery, shop_delivery_sla_minutes (30 unless configured), has_fulfillment and authorized delivery destinations. Send every payment/review/processing/delayed/delivered/cancelled/refunded transition with a newer source timestamp.
Payments/refunds related to an order must include data.order_external_id matching the order external_id exactly. Wallet deposits must stay distinct and must not be presented as order payments. Never send raw account credentials, secret keys, screenshots or publicly accessible private-proof URLs. Proofs stay in private Store storage.
The CRM uses server-only SHOP_CRM_ACTION_KEY to call https://foxgenofficial.lovable.app/api/public/shop/v1/actions. Keep the existing approve, reject, request_info, add_fulfillment, deliver_email, deliver_telegram and upsert_product contracts. Verify authorization, current order state and duplicate actions inside the Store before financial or delivery effects; acknowledgement must follow durable commit and trigger a new CRM sync.
Catalogue upsert_product pushes remain unpublished until Store owner review. Never route imported orders through CRM supplier fulfillment.
Verify one real Store order appears under CRM FoxGen Store Orders, links to the right member, changes after payment review and reads back the real delivery timestamp. Do not claim live delivery verified without an authorized real test.`;

export function FoxgenConnectionSetup() {
  const query = useQuery(foxgenConnectionOptions);
  const data = query.data;
  async function copy() {
    try {
      await navigator.clipboard.writeText(setup);
      toast.success("Store connection instructions copied");
    } catch {
      toast.error("Could not copy. Try again from your browser.");
    }
  }
  return (
    <section className="mb-6 space-y-4 border-b pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">FOXGEN AI STORE connection</h2>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw className={query.isFetching ? "animate-spin" : ""} />
            Check connection
          </Button>
          <Button variant="outline" size="sm" onClick={copy}>
            <Copy />
            Copy Store setup
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/settings">
              <Settings2 />
              Sync key
            </Link>
          </Button>
        </div>
      </div>
      {query.isPending ? (
        <p className="text-sm text-muted-foreground">Checking connection…</p>
      ) : query.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Could not check the connection. Try again.
        </p>
      ) : (
        data && (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge variant={data.integration?.enabled ? "success" : "warning"}>
                {data.integration?.enabled ? "Inbound sync enabled" : "Inbound sync not enabled"}
              </Badge>
              <Badge variant={data.actionsConfigured ? "success" : "warning"}>
                {data.actionsConfigured
                  ? "Store action key saved · not live-verified"
                  : "Store action key missing"}
              </Badge>
            </div>
            <dl className="grid gap-4 sm:grid-cols-4">
              {[
                ["Members", data.counts["customers"] ?? 0],
                ["Orders", data.counts["orders"] ?? 0],
                ["Payments", data.counts["payments"] ?? 0],
                ["Refunds", data.counts["refunds"] ?? 0],
              ].map(([label, count]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="figure mt-1 text-xl font-semibold">{count}</dd>
                </div>
              ))}
            </dl>
            <p className="text-sm text-muted-foreground">
              Last import:{" "}
              {data.latest ? new Date(data.latest).toLocaleString() : "No records received"}
            </p>
            {(data.missingCustomer > 0 || data.missingPaymentTime > 0) && (
              <p role="status" className="text-sm text-destructive">
                Store data needs attention: {data.missingCustomer} orders missing member links;{" "}
                {data.missingPaymentTime} verified/processing orders missing payment timestamps.
              </p>
            )}
          </>
        )
      )}
      <details>
        <summary className="cursor-pointer text-sm font-medium">Connection checklist</summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            Create or copy the one-time inbound sync key in Settings; save it in the Store’s CRM
            settings with the CRM sync URL.
          </li>
          <li>
            Save the Store’s separate action key as SHOP_CRM_ACTION_KEY in this project’s secrets.
            This is not the inbound sync key.
          </li>
          <li>
            Copy Store setup and paste it into the FOXGEN AI STORE project’s Lovable chat to align
            its sender.
          </li>
          <li>
            Publish the CRM changes, then check a real order here and open its member profile.
          </li>
        </ol>
      </details>
    </section>
  );
}
