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
- Stack is TanStack Start (not Next.js, which the uploaded docs mention); keep pages in `src/routes/`, owner pages under `src/routes/_authenticated/`. Why: Lovable only supports TanStack Start.
- Only the first account gets the `admin` role (trigger on signup); every table's RLS requires `has_role(auth.uid(),'admin')`. Why: single-owner CRM, extra signups must see nothing.
- Telegram bot = DB-persisted state machine in `src/lib/bot.server.ts` behind `/api/public/telegram/webhook` (secret header = sha256 of connection key), calling Telegram through the connector gateway. Why: Grammy conversations need long-lived in-memory replay, which a stateless worker can't keep.
- Supplier calls go only through `ResellerAPI.createOrderSafe` (idempotent `external_order_id`, order_status check on timeout) and `fulfillOrder` claims the row via `processing_started_at` before calling. Why: prevent double charges/deliveries.
- Supplier payload parsing is tolerant (`src/lib/reseller-normalize.ts`) because the response shape is undocumented; adjust there once the real shape is known.
- Order money columns are per-unit; `total_amount`, `total_cost`, `profit` are generated columns, and customer/product stats update via trigger when an order becomes completed. Why: one source of truth for profit.
- Secrets (supplier key, Telegram key) are env vars, never rows in `settings`.
