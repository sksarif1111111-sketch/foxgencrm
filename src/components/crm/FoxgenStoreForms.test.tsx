import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FoxgenDeliveryForm } from "./FoxgenDeliveryForm";
import { FoxgenCustomerActions } from "./FoxgenCustomerActions";
import type { FoxgenOrder } from "@/lib/foxgen-orders";

const mocks = vi.hoisted(() => ({ operate: vi.fn(), customer: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/lib/foxgen.functions", () => ({
  operateFoxgenOrder: mocks.operate,
  operateFoxgenCustomer: mocks.customer,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}));
const id = "b9991bde-8d84-443f-9227-a889e18f6dfd";
const order: FoxgenOrder = {
  integration_id: "foxgen",
  entity: "orders",
  external_id: id,
  status: "under_review",
  data: { channel: "telegram" },
  name: "Order",
  amount: 10,
  currency: "USD",
  received_at: "2026-11-25T10:00:00Z",
  source_updated_at: "2026-11-25T10:00:00Z",
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  mocks.invalidate.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("Store form action safeguards", () => {
  it("does not send delivery fields before confirmation, and cancel sends nothing", () => {
    render(<FoxgenDeliveryForm order={order} verified onDelivered={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "temporary-test-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Approve & Deliver" }));
    expect(mocks.operate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mocks.operate).not.toHaveBeenCalled();
  });
  it("clears delivery fields after a successful send without persisting them in query data", async () => {
    mocks.operate.mockResolvedValue({ ok: true, delivery: { telegram: "sent" } });
    const delivered = vi.fn();
    render(<FoxgenDeliveryForm order={order} verified onDelivered={delivered} />);
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "temporary-test-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Approve & Deliver" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm & Deliver" }));
    await waitFor(() => expect(delivered).toHaveBeenCalledTimes(1));
    expect(mocks.operate.mock.calls[0]?.[0].data.fields).toEqual({
      password: "temporary-test-password",
    });
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["foxgen"] });
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(screen.getByText("Telegram: sent")).toBeTruthy();
  });
  it("shows per-channel results and keeps the order in Waiting for approval when nothing was sent", async () => {
    mocks.operate.mockResolvedValue({
      ok: false,
      code: "NOT_DELIVERED",
      error: "Delivery failed (Telegram: bot blocked)",
      delivery: { telegram: "bot_blocked" },
    });
    const delivered = vi.fn();
    render(<FoxgenDeliveryForm order={order} verified onDelivered={delivered} />);
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "temporary-test-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Approve & Deliver" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm & Deliver" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Waiting for approval");
    expect(screen.getByText("Telegram: bot blocked")).toBeTruthy();
    expect(delivered).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Password")).toHaveValue("temporary-test-password");
  });
  it("blocks delivery until the owner verifies payment", () => {
    render(<FoxgenDeliveryForm order={order} verified={false} onDelivered={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "temporary-test-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Approve & Deliver" }));
    expect(mocks.operate).not.toHaveBeenCalled();
  });
  it("reuses the exact request after an ambiguous error instead of creating another delivery", async () => {
    mocks.operate
      .mockResolvedValueOnce({ ok: false, error: "Interrupted" })
      .mockResolvedValueOnce({ ok: true });
    render(<FoxgenDeliveryForm order={order} verified onDelivered={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "temporary-test-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Approve & Deliver" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm & Deliver" }));
    fireEvent.click(await screen.findByRole("button", { name: "Retry same request" }));
    await waitFor(() => expect(mocks.operate).toHaveBeenCalledTimes(2));
    expect(mocks.operate.mock.calls[0]?.[0].data.request_id).toBe(
      mocks.operate.mock.calls[1]?.[0].data.request_id,
    );
  });
  it("requires confirmation before changing the wallet and sends amount and reason", async () => {
    mocks.customer.mockResolvedValue({ ok: true, balance_usd: 7 });
    render(<FoxgenCustomerActions customerId={id} data={{ channel: "telegram" }} wallet />);
    fireEvent.click(screen.getByRole("button", { name: "Adjust wallet" }));
    fireEvent.change(screen.getByLabelText("Amount (USD; negative to deduct)"), {
      target: { value: "-5" },
    });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Owner correction" } });
    fireEvent.click(screen.getByRole("button", { name: "Review adjustment" }));
    expect(mocks.customer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm and send" }));
    await waitFor(() => expect(mocks.customer).toHaveBeenCalledTimes(1));
    expect(mocks.customer.mock.calls[0]?.[0].data).toMatchObject({
      action: "adjust_wallet",
      customer_id: id,
      amount_usd: -5,
      reason: "Owner correction",
    });
  });
  it("sends a customer message only to selected Telegram, Email and Account channels", async () => {
    mocks.customer.mockResolvedValue({
      ok: true,
      channels: { telegram: "sent", email: "sent", account: "sent" },
    });
    const receipt = vi.fn();
    render(
      <FoxgenCustomerActions customerId={id} data={{ channel: "telegram" }} onMessage={receipt} />,
    );
    fireEvent.change(screen.getByLabelText("Message customer"), {
      target: { value: "Payment review update" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "email" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "account" }));
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(mocks.customer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm and send" }));
    await waitFor(() => expect(receipt).toHaveBeenCalledTimes(1));
    expect(mocks.customer.mock.calls[0]?.[0].data).toMatchObject({
      action: "message_customer",
      customer_id: id,
      message: "Payment review update",
      channels: ["telegram", "email", "account"],
    });
    expect(screen.getByLabelText("Message customer")).toHaveValue("");
  });
});
