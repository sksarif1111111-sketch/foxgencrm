# Store connection
- [x] Reconcile transaction references from exact-linked order payments and provide an order-specific Store proof repair handoff.
- [x] Verify 28 tests and current owner order readback, copied repair instructions and zero runtime errors; live proof endpoint is absent (404), existing Store admin proof endpoint rejects CRM authorization (401), and current expired website order has no submitted reference.
- [x] Make Home an order-first operations workspace with payment review and urgent delivery queues.
- [x] Add owner-protected payment-evidence viewer, safe fixed-endpoint download and Store setup instructions; preserve the bot webhook.
- [ ] Enable live private-proof sharing in Store (blocked: Store snapshot has only a session-protected admin proof endpoint, not the CRM-key-authorized endpoint; must be changed in the Store project).
- [x] Verify 33 regression tests, owner Home with five real imported orders, detail navigation, unavailable proof sharing error, zero runtime errors and mobile layout without overflow.
- [x] Align imported marketplace order/payment/delivery states, keeping Store approval authoritative and native sales unchanged.
- [x] Add owner-only connection diagnostics and a copyable Store setup checklist; show exact-linked payment/refund history on orders.
- [x] Verify 42 compatibility/regression tests, copied setup instructions, signed-in real order/member navigation, awaiting-payment action guard and mobile layout; external live delivery remains blocked below.
- [x] Expand FoxGen customers into a member directory with wallet funding history; verify existing buyer and zero-order member pages on desktop/mobile, plus exact funding matches and snapshot balances in tests.
- [x] Add best-effort supplier catalogue pushes to the Store actions API; verify payload, key, continuation after rejection and successful local sync despite push failure in tests (53 tests passing).
- [x] Verify populated wallet funding history against live imported records (approved deposits read back in the matching member profile).
- [ ] Verify live supplier-to-Store catalogue push and unpublished Store review state (blocked: supplier responds “Reseller account is not active”; Store acceptance and review state require a successful supplier sync).
- [x] Correct the Store action secret name and clarify the existing Settings key control.
- [x] Add FoxGen customer profiles, exact buyer-order matching and order-to-profile links; verify owner views with a synced buyer and two orders on desktop/mobile.
- [x] Create authenticated inbound sync API and owner-managed credentials.
- [x] Show imported store records without supplier fulfillment.
- [x] Test authorization, imports, replay handling, and owner views (local signed-in flow verified; real-store flow awaits sender).
- [x] Confirm FoxGen sender imports are arriving (synced customer profiles and repeat orders read back in owner views).

# FoxGen order operations
- [x] Add separate owner-only order list/detail and Store actions.
- [x] Add shared delivery clock, Dashboard metrics and connection status.
- [x] Verify rules and authenticated empty list, Dashboard and Settings on desktop/mobile; keep native fulfillment unchanged. Action boundary tests use mocked Store responses.
- [ ] Verify live Store delivery (blocked: requires a Store order eligible for delivery and permission to notify its customer; populated order/customer navigation is verified).

# FOXGEN CRM redesign
- [x] Apply shared branding and navigation across CRM pages.
- [x] Improve the dashboard, Store order and member workspaces, and connection diagnostics without changing transaction rules.
- [x] Verify owner search, real Store order/member navigation, filters, wallet tabs, signed-out evidence denial and report date controls at 390, 430, 768, 903, 1280 and 1600 px.
- [ ] Independently managed product creation, duplication, publication and archiving are not supported by the native supplier cache; they require a separate catalogue ownership model so the supplier sync cannot overwrite them.
