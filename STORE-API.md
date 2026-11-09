# FoxGen → CRM API

## Setup
1. In this CRM, open **FoxGen Store**, create a key, and copy it before dismissing it. Only its hash is stored.
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
Build a server-side, durable outbox sender to the endpoint above. Read actual source schemas before mapping. Include order items and related payment/customer references in `data`. Publish create/update events for store orders, payments, customers, products, refunds, expenses and inventory. Backfill existing records in batches. Send only after source transactions commit. Retry safely using stable IDs/timestamps, and surface pending/failed syncs to the owner. Use deletion status/tombstones rather than losing history. Never call this CRM's supplier fulfillment. Verify a real store purchase appears in the CRM. The sender has NOT been installed by this CRM project.