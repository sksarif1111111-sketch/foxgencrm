# Store connection
- [x] Expand FoxGen customers into a member directory with wallet funding history; verify existing buyer and zero-order member pages on desktop/mobile, plus exact funding matches and snapshot balances in tests.
- [x] Add best-effort supplier catalogue pushes to the Store actions API; verify payload, key, continuation after rejection and successful local sync despite push failure in tests (53 tests passing).
- [ ] Verify populated wallet funding history against live imported records (blocked: existing members have no wallet balance, member number, join date or payment records yet).
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