# FoxGen → CRM API

## Setup
1. In this CRM, open **Settings → FoxGen Store sync key**, create a key, and copy it immediately before dismissing it. It is shown only once; only its hash is stored. The existing **FoxGen Store** page offers the same key control.
2. In the FOXGEN project's own Lovable chat, request the sender described below. This project's tools cannot edit that project.
3. Store the key as the sender's server-only `FOXGEN_CRM_API_KEY` secret; never put it in browser code or a database setting.
4. Publish this CRM before using the published endpoint. Use the preview endpoint while testing.

## Request
`POST https://foxgencrm.lovable.app/api/public/store/sync`

Preview: `https://project--89ef405a-3b92-4a46-a34f-3186c0336acf-dev.lovable.app/api/public/store/sync`

Headers: `Authorization: Bearer <key>`, `Content-Type: application/json`.
Call server-to-server only (no browser CORS access). Payload limit: 256 KB, 1–100 records per batch.

```json
{
  "records": [{
    "entity": "orders",
    "external_id": "original-store-order-id",
    "name": "Product or customer name",
    "status": "paid",
    "amount": 24,
    "currency": "USD",
    "updated_at": "2026-11-09T21:00:00Z",
    "data": { "items": [{ "product_id": "p1", "quantity": 2 }], "payment_status": "paid" }
  }]
}
```

Entities: `orders`, `payments`, `customers`, `products`, `refunds`, `expenses`, `inventory`. `external_id` and `updated_at` are required. Optional display fields default to empty/null; `data` is an object for source business fields. Do not send passwords, tokens, API keys or delivered account credentials.

Response: `{ "ok": true, "received": 1, "changed": 1 }`.
Repeated identical versions are ignored; only a newer source timestamp updates the same entity/ID. Use persistent source IDs and timestamps. Retry the same batch on network errors or 503; do not generate new IDs/timestamps just for retries. 401 means incorrect/replaced/disabled key; 400 means invalid records. Records remain tracking-only in FoxGen Store, separate from supplier orders and existing revenue reports.

## Sender task for FOXGEN
For buyer profiles, send `entity: "customers"` with a stable `external_id`, and include the same value as `data.customer_external_id` on every related order. FoxGen Customers displays imported profiles and their exact-match purchase history separately from native CRM customers.

Store operator actions read the server-only `SHOP_CRM_ACTION_KEY` secret in this CRM and call the Store actions endpoint. This is separate from the CRM-generated inbound `fgcrm_...` sync key.

Build a server-side, durable outbox sender to the endpoint above. Read actual source schemas before mapping. Include order items and related payment/customer references in `data`. Publish create/update events for store orders, payments, customers, products, refunds, expenses and inventory. Backfill existing records in batches. Send only after source transactions commit. Retry safely using stable IDs/timestamps, and surface pending/failed syncs to the owner. Use deletion status/tombstones rather than losing history. Never call this CRM's supplier fulfillment. Verify a real store purchase appears in the CRM. Existing imports have been observed; sender changes must still be made in the Store project.

## Marketplace compatibility and easy setup

Open **FoxGen Store → FOXGEN AI STORE connection** for actual imported counts, last import, missing member links/payment timestamps, the action-key configured flag and **Copy Store setup**. A saved action key is not evidence that Store actions work. The checklist separates the one-time inbound key from the Store's `SHOP_CRM_ACTION_KEY`.

Order statuses supported for display/filtering include `pending_payment`/`awaiting_payment`, `proof_submitted`/`payment_submitted`, `under_review`, `payment_verified`/`payment_confirmed`, `processing`/`awaiting_fulfillment`, `delayed`, `delivered`/`completed`, `payment_rejected`/`rejected`, `cancelled`, `refunded` and `expired`. Send lowercase snake_case source statuses. These are read-side aliases, not financial transitions.

Send `confirmed_at` (or `payment_verified_at` / `payment_confirmed_at`) only after payment verification. Never use the order creation timestamp to start the delivery clock. Send `delivered_at` (or `delivery_completed_at`) only after actual delivery. The CRM honors `shop_delivery_sla_minutes` or `delivery_target_minutes`, defaulting to 30.

For payment/refund history on an order, send `data.order_external_id` matching that order's stable `external_id` exactly. `customer_external_id` alone does not link a deposit to an order. Send amount, currency, status, transaction/reference and source version; wallet deposits stay separate. Keep screenshots and account credentials in private Store storage, not in the import payload or public URLs. Private proof viewing, refunds, stock reservations and wallet credits remain Store-owned; the CRM does not fabricate unsupported Store action contracts.