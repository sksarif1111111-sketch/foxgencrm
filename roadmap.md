# Store connection
- [ ] Correct the Store action secret name and clarify the existing Settings key control.
- [ ] Add FoxGen customer profiles, exact buyer-order matching and order-to-profile links; verify owner views.
- [x] Create authenticated inbound sync API and owner-managed credentials.
- [x] Show imported store records without supplier fulfillment.
- [x] Test authorization, imports, replay handling, and owner views (local signed-in flow verified; real-store flow awaits sender).
- [ ] Connect FoxGen sender (blocked: the other project must be edited in its own chat).

# FoxGen order operations
- [x] Add separate owner-only order list/detail and Store actions.
- [x] Add shared delivery clock, Dashboard metrics and connection status.
- [x] Verify rules and authenticated empty list, Dashboard and Settings on desktop/mobile; keep native fulfillment unchanged. Action boundary tests use mocked Store responses.
- [ ] Verify live Store delivery (blocked: no synced Store orders; populated detail and real delivery remain unverified).