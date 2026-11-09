import { z } from "zod";

export const STORE_ENTITIES = ["orders", "payments", "customers", "products", "refunds", "expenses", "inventory"] as const;
export const STORE_URL = "https://foxgenofficial.lovable.app";
export const SyncSchema = z.object({
  records: z.array(z.object({
    entity: z.enum(STORE_ENTITIES),
    external_id: z.string().trim().min(1).max(200),
    name: z.string().max(300).default(""),
    status: z.string().max(80).default(""),
    amount: z.number().finite().min(-1e12).max(1e12).nullable().default(null),
    currency: z.string().max(10).nullable().default(null),
    updated_at: z.string().datetime({ offset: true }),
    data: z.record(z.unknown()).default({}),
  }).strict()).min(1).max(100),
}).strict().superRefine(({ records }, ctx) => {
  const ids = new Set<string>();
  for (const record of records) {
    const key = `${record.entity}:${record.external_id}`;
    if (ids.has(key)) ctx.addIssue({ code: "custom", message: "Duplicate record in batch" });
    ids.add(key);
  }
});

export type SyncBatch = z.infer<typeof SyncSchema>;

export async function hashStoreKey(key: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function handleStoreSync(request: Request, deps: {
  authorize: (hash: string) => Promise<string | null>;
  ingest: (id: string, batch: SyncBatch) => Promise<number>;
}) {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  const header = request.headers.get("authorization") ?? "";
  if (!/^Bearer fgcrm_[a-f0-9]{64}$/.test(header)) return reply({ error: "Unauthorized" }, 401);
  const id = await deps.authorize(await hashStoreKey(header.slice(7)));
  if (!id) return reply({ error: "Unauthorized" }, 401);
  if (!request.headers.get("content-type")?.includes("application/json")) return reply({ error: "Use application/json" }, 415);
  const reader = request.body?.getReader();
  if (!reader) return reply({ error: "Missing body" }, 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 256 * 1024) { await reader.cancel(); return reply({ error: "Batch exceeds 256 KB" }, 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let payload: unknown;
  try { payload = JSON.parse(new TextDecoder().decode(bytes)); } catch { return reply({ error: "Invalid JSON" }, 400); }
  const parsed = SyncSchema.safeParse(payload);
  if (!parsed.success) return reply({ error: "Invalid records", issues: parsed.error.issues.map(({ path, message }) => ({ path, message })) }, 400);
  const changed = await deps.ingest(id, parsed.data);
  return reply({ ok: true, received: parsed.data.records.length, changed });
}