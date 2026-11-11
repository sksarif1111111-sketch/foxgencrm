import { describe, expect, it } from "vitest";
import {
  ActionSchema,
  allowedAction,
  deliveryClock,
  foxgenMetrics,
  type FoxgenOrder,
} from "./foxgen-orders";

const now = Date.parse("2026-11-11T00:30:00Z");
const row = (status: string, data: FoxgenOrder["data"]): FoxgenOrder => ({
  status,
  data,
  integration_id: "foxgen",
  entity: "orders",
  external_id: "FG-001234",
  name: "FoxGEN Pro Monthly x1 — FG-001234",
  amount: 20,
  currency: "USD",
  received_at: "2026-11-11T00:25:00Z",
  source_updated_at: "2026-11-11T00:25:00Z",
});
describe("FoxGen delivery rules", () => {
  it("defaults to a 30 minute window", () => {
    expect(deliveryClock("2026-11-11T00:15:00Z", undefined, null, now)?.label).toBe(
      "15 min remaining",
    );
  });
  it("uses green for the first half", () => {
    expect(deliveryClock("2026-11-11T00:20:00Z", 30, null, now)?.zone).toBe("success");
  });
  it("uses amber for the second half", () => {
    expect(deliveryClock("2026-11-11T00:10:00Z", 30, null, now)?.zone).toBe("warning");
  });
  it("shows overdue minutes in red", () => {
    expect(deliveryClock("2026-11-10T23:53:00Z", 30, null, now)).toEqual({
      zone: "danger",
      label: "7 min overdue",
      overdue: true,
    });
  });
  it("honors a supplied SLA", () => {
    expect(deliveryClock("2026-11-11T00:10:00Z", 60, null, now)?.label).toBe("40 min remaining");
  });
  it("delivered within window is static green", () => {
    expect(deliveryClock("2026-11-11T00:00:00Z", 30, "2026-11-11T00:14:00Z", now)).toEqual({
      zone: "success",
      label: "Delivered in 14 min",
      overdue: false,
    });
  });
  it("late delivery is static amber, not overdue", () => {
    expect(deliveryClock("2026-11-11T00:00:00Z", 30, "2026-11-11T00:38:00Z", now)).toEqual({
      zone: "warning",
      label: "Delivered in 38 min",
      overdue: false,
    });
  });
  it("missing confirmation does not start a clock", () => {
    expect(deliveryClock(null, 30, null, now)).toBeNull();
  });
  it("counts only running overdue orders", () => {
    const data = { confirmed_at: "2026-11-10T23:00:00Z" };
    expect(
      foxgenMetrics(
        [
          row("awaiting_fulfillment", data),
          row("payment_confirmed", data),
          row("under_review", data),
          row("cancelled", data),
        ],
        now,
      ).overdue,
    ).toBe(2);
  });
  it("averages delivery times only in the last 7 days", () => {
    expect(
      foxgenMetrics(
        [
          row("delivered", {
            confirmed_at: "2026-11-11T00:00:00Z",
            delivered_at: "2026-11-11T00:14:00Z",
          }),
          row("delivered", {
            confirmed_at: "2026-11-02T00:00:00Z",
            delivered_at: "2026-11-02T00:38:00Z",
          }),
        ],
        now,
      ).averageMinutes,
    ).toBe(14);
  });
  it("review states allow approve and reject only", () => {
    for (const status of ["under_review", "payment_submitted"]) {
      expect(allowedAction("approve", row(status, {}))).toBe(true);
      expect(allowedAction("reject", row(status, {}))).toBe(true);
      expect(allowedAction("add_fulfillment", row(status, {}))).toBe(false);
    }
  });
  it("approved orders allow fulfillment before delivery", () => {
    expect(
      allowedAction(
        "add_fulfillment",
        row("payment_confirmed", { confirmed_at: "2026-11-11T00:00:00Z" }),
      ),
    ).toBe(true);
    expect(
      allowedAction("add_fulfillment", row("delivered", { confirmed_at: "2026-11-11T00:00:00Z" })),
    ).toBe(false);
  });
  it("delivery requires material and the relevant destination", () => {
    const d = {
      confirmed_at: "2026-11-11T00:00:00Z",
      has_fulfillment: true,
      delivery_emails: ["customer@example.test"],
    };
    expect(allowedAction("deliver_email", row("awaiting_fulfillment", d))).toBe(true);
    expect(allowedAction("deliver_telegram", row("awaiting_fulfillment", d))).toBe(false);
    expect(
      allowedAction(
        "deliver_telegram",
        row("awaiting_fulfillment", { ...d, telegram_user_id: "123" }),
      ),
    ).toBe(true);
    expect(
      allowedAction("deliver_email", row("awaiting_fulfillment", { ...d, has_fulfillment: false })),
    ).toBe(false);
  });
  it("reject requires a short reason", () => {
    expect(
      ActionSchema.safeParse({ action: "reject", order_id: "FG-001234", reason: " " }).success,
    ).toBe(false);
    expect(
      ActionSchema.safeParse({
        action: "reject",
        order_id: "FG-001234",
        reason: "Payment not received",
      }).success,
    ).toBe(true);
  });
  it("material kind must be link, code or instructions", () => {
    for (const kind of ["link", "code", "instructions"])
      expect(
        ActionSchema.safeParse({
          action: "add_fulfillment",
          order_id: "FG-001234",
          kind,
          content: "Delivery content",
        }).success,
      ).toBe(true);
    expect(
      ActionSchema.safeParse({
        action: "add_fulfillment",
        order_id: "FG-001234",
        kind: "file",
        content: "Delivery content",
      }).success,
    ).toBe(false);
  });
  it("more info requires a message", () => {
    expect(
      ActionSchema.safeParse({ action: "request_info", order_id: "FG-001234", message: "" })
        .success,
    ).toBe(false);
  });
});
