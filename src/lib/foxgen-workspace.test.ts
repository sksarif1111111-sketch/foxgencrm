import { describe, expect, it } from "vitest";
import { approvalClock, workspaceOrders } from "./foxgen-workspace";
import { allowedAction, type FoxgenOrder } from "./foxgen-orders";
const row = (id: string, status: string, data: FoxgenOrder["data"] = {}): FoxgenOrder => ({
  external_id: id,
  status,
  data,
  integration_id: "foxgen",
  entity: "orders",
  name: id,
  amount: 10,
  currency: "USDT",
  received_at: "2026-11-11T12:00:00Z",
  source_updated_at: "2026-11-11T12:00:00Z",
});
describe("order-first workspace", () => {
  it("sorts approval by oldest proof submission, not latest sync", () => {
    const old = {
      ...row("old", "under_review", { proof_submitted_at: "2026-11-25T10:00:00Z" }),
      source_updated_at: "2026-11-25T12:00:00Z",
    };
    const recent = row("recent", "under_review", { proof_submitted_at: "2026-11-25T10:20:00Z" });
    expect(
      workspaceOrders([recent, old], Date.parse("2026-11-25T10:25:00Z")).review.map(
        (order) => order.external_id,
      ),
    ).toEqual(["old", "recent"]);
  });
  it("starts a separate 30-minute approval clock only from proof_submitted_at", () => {
    const order = row("proof", "under_review", {
      proof_submitted_at: "2026-11-25T10:00:00Z",
      confirmed_at: "2026-11-25T10:10:00Z",
    });
    expect(approvalClock(order, Date.parse("2026-11-25T10:15:00Z"))).toEqual({
      overdue: false,
      label: "15 min remaining",
    });
    expect(
      approvalClock(
        row("missing", "under_review", { created_at: "2026-11-25T10:00:00Z" }),
        Date.parse("2026-11-25T10:31:00Z"),
      ),
    ).toBeNull();
  });
  it("highlights approval after, not at, 30 minutes and stops after delivery", () => {
    const data = { proof_submitted_at: "2026-11-25T10:00:00Z" };
    expect(
      approvalClock(row("proof", "under_review", data), Date.parse("2026-11-25T10:30:00Z"))
        ?.overdue,
    ).toBe(false);
    expect(
      approvalClock(row("proof", "under_review", data), Date.parse("2026-11-25T10:30:01Z"))
        ?.overdue,
    ).toBe(true);
    expect(
      approvalClock(row("done", "delivered", data), Date.parse("2026-11-25T10:31:00Z")),
    ).toBeNull();
  });
  it("keeps submitted proofs awaiting owner review, never automatic delivery", () => {
    const o = row("proof", "proof_submitted", { payment_evidence_url: "telegram-file:private-id" });
    expect(workspaceOrders([o], 0).review.map((o) => o.external_id)).toEqual(["proof"]);
    expect(allowedAction("deliver_telegram", o)).toBe(false);
  });
  it("prioritizes the earliest 30-minute delivery deadline over recent orders", () => {
    const q = workspaceOrders(
      [
        row("later", "processing", { confirmed_at: "2026-11-11T12:20:00Z" }),
        row("urgent", "processing", { confirmed_at: "2026-11-11T12:00:00Z" }),
      ],
      Date.parse("2026-11-11T12:31:00Z"),
    );
    expect(q.delivery.map((o) => o.external_id)).toEqual(["urgent", "later"]);
    expect(q.overdue).toBe(1);
  });
  it("keeps delayed orders visible even when the Store did not send a confirmation time", () => {
    const queue = workspaceOrders(
      [row("reported-delay", "delayed"), row("unpaid", "pending_payment")],
      0,
    );
    expect(queue.delayed.map((order) => order.external_id)).toEqual(["reported-delay"]);
    expect(queue.pending.map((order) => order.external_id)).toEqual(["unpaid"]);
  });
  it("does not start delivery deadlines from a screenshot or creation time", () => {
    expect(
      workspaceOrders(
        [row("unverified", "awaiting_payment", { created_at: "2026-11-11T10:00:00Z" })],
        Date.parse("2026-11-11T12:31:00Z"),
      ).overdue,
    ).toBe(0);
  });
});
