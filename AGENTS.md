<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Home prioritizes imported Store review/delivery queues; private proof viewing uses an owner-authorized server function and a fixed Store endpoint, returning only bounded image/PDF bytes in temporary browser blobs. Why: keep bot ownership in the Store and prevent public proof URLs, token leakage and arbitrary URL fetching.
- Settings sync-key controls reuse the existing owner-authorized rotation function and integration query key; raw keys stay only in temporary component state. Why: keep both connection surfaces consistent without persisting credentials in the browser.
- Password-only owner sign-in passes the fixed owner email to Cloud Auth; never compare passwords in the browser or replace account authentication with a shared gate. Why: existing owner RLS and session checks must continue protecting CRM data.
- Stack is TanStack Start (not Next.js, which the uploaded docs mention); keep pages in `src/routes/`, owner pages under `src/routes/_authenticated/`. Why: Lovable only supports TanStack Start.
- Only the first account gets the `admin` role (trigger on signup); every table's RLS requires `has_role(auth.uid(),'admin')`. Why: single-owner CRM, extra signups must see nothing.
- Telegram bot = DB-persisted state machine in `src/lib/bot.server.ts` behind `/api/public/telegram/webhook` (secret header = sha256 of connection key), calling Telegram through the connector gateway. Why: Grammy conversations need long-lived in-memory replay, which a stateless worker can't keep.
- Supplier calls go only through `ResellerAPI.createOrderSafe` (idempotent `external_order_id`, order_status check on timeout) and `fulfillOrder` claims the row via `processing_started_at` before calling. Why: prevent double charges/deliveries.
- Supplier payload parsing is tolerant (`src/lib/reseller-normalize.ts`) because the response shape is undocumented; adjust there once the real shape is known.
- Order money columns are per-unit; `total_amount`, `total_cost`, `profit` are generated columns, and customer/product stats update via trigger when an order becomes completed. Why: one source of truth for profit.
- Secrets (supplier key, Telegram key) are env vars, never rows in `settings`.
- Store imports remain in `store_records` with version-aware atomic ingest; operator actions use the separate owner-authorized FoxGen Store actions API, never native supplier fulfillment. Why: the Store owns payment and delivery, and sync remains the authoritative order state.
- FoxGen member profiles retain non-buyers and use imported customer external IDs for exact order/payment data.customer_external_id matches; authenticated queries paginate all matching records and wallet balances come only from customer snapshots. Why: preserve complete member histories without merging native CRM customers or inventing balances from payments.
- After completing native catalogue writes and cache metadata, await bounded best-effort Store upsert_product pushes through the existing server-only action key; return push failures separately and never send publication flags. Why: share the priced catalogue without changing native sales or bypassing Store review.
- FoxGen clocks and KPIs share pure delivery rules; action acknowledgements are temporary UI overlays until a newer sync version arrives. Why: consistent SLA boundaries without overwriting imported source versions.
- Store integration keys are generated for the owner, shown once, and stored only as SHA-256 hashes; the public sync handler verifies the key before privileged access. Why: authenticate external writes without exposing CRM login or raw credentials.
- Marketplace status/timestamp aliases are read-side compatibility only; payment/refund histories match exact order_external_id and diagnostics expose only counts/configured flags. Why: support evolving Store events without inventing financial state, leaking secrets or mixing wallet deposits with purchases.
- Order detail may fill an absent transaction reference from the newest exact-order-linked payment, never from refunds or customer-only deposits. Why: show separately synced evidence without manufacturing payment state or crossing customer orders.

- CRM navigation, page hierarchy, tables and metric cards use the shared shell and semantic theme tokens; keep route-specific styling focused on information layout. Why: preserve consistent behavior and responsiveness across existing workflows.
- Store workspace filters and summaries are read-only projections of owner-authorized data; member totals use exact IDs and separate currencies, and timelines use explicit event timestamps. Why: avoid inventing financial or operational state.
