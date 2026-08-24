# Dawfuzy Water Ledger

A React + Vite progressive web app for Dawfuzy, a family-owned water seller in Ghana. It replaces handwritten daily records with fast water sales, expenses, live stock counts and daily totals.

## Run the project

```powershell
npm install
npm run dev
```

Production checks:

```powershell
npm run typecheck
npm run build
npm run preview
```

## Chosen tech stack

### Prototype / frontend

- **React + TypeScript:** component-based UI with typed product, stock and transaction records.
- **Vite:** fast development server and optimized production builds.
- **vite-plugin-pwa + Workbox:** installable app, service-worker generation and offline asset caching.
- **Tailwind CSS v4:** utility-first responsive styling, custom Dawfuzy design tokens and consistent water-blue/teal/cream surfaces. A small companion stylesheet keeps only the bespoke editorial details.
- **Browser localStorage:** prototype persistence only, allowing the current demo to work without a server.

### Recommended production platform

- **Supabase:** managed PostgreSQL database, authentication, row-level security, storage and server functions. This keeps the first production system simpler than maintaining a custom backend while preserving an escape path to standard PostgreSQL.
- **IndexedDB with Dexie:** durable offline transaction queue and local catalogue cache. `localStorage` is not sufficient for production financial data.
- **TanStack Query:** server-state caching, retries, mutation status and offline-aware synchronization.
- **Zod:** shared runtime validation for prices, quantities, imported rows and API payloads.
- **React Hook Form:** reliable entry forms and validation while keeping low-end mobile performance strong.
- **Sentry:** production error and failed-sync monitoring.
- **Vitest + React Testing Library + Playwright:** unit, component and complete sale/sync workflow tests.
- **Vercel or Cloudflare Pages:** HTTPS hosting for the frontend/PWA; Supabase hosts the data tier.

## Why this approach fits Dawfuzy

- A PWA installs from the browser and avoids maintaining separate Android and iOS applications.
- Offline-first entry matters when internet service is weak or intermittent.
- PostgreSQL fits transactional data, stock movements, audit history and reporting.
- Server-side accounts and row-level permissions let the owner and family staff have different access safely.
- An append-only stock movement and audit model makes discrepancies traceable.

## Product approach

### 1. Understand and clean the current records — 1 week

- Observe a full selling day: receiving water, selling packs/bags, expenses, credit, returns and closing cash.
- Create the approved product catalogue: brand, bottle/sachet size, units per pack, selling price, cost price, opening quantity and reorder level.
- Conduct a physical stock count and use it as the digital opening balance.
- Agree how corrections, damaged water, personal withdrawals, credit sales and delivery fees are recorded.
- Import only the recent history needed for comparison. Do not transcribe years of notebooks without a clear reporting need.

### 2. Production MVP — 3 to 5 weeks

- Secure owner/staff authentication and role permissions.
- Product catalogue, purchases/restocking, sales, expenses, stock adjustments and daily close.
- Offline queue: every entry receives a unique client ID and visible pending/synced/failed status.
- Immutable audit history: financial entries are voided with a reason, never silently deleted.
- Daily cloud backup, CSV export and tested restore procedure.
- Pilot on one phone with paper and digital records in parallel for 5–7 days.

### 3. Operational rollout — 2 to 3 weeks

- Reconcile daily digital totals against cash and physical stock.
- Add supplier purchases, low-stock alerts, receipt sharing and owner summaries.
- Train each family member with a short role-based checklist.
- Stop using the paper ledger only after at least five consecutive reconciled days and a successful backup restore test.

### 4. Growth — based on evidence

- Gross profit using saved cost-price snapshots.
- Customer credit and payment collection.
- Delivery route and rider records.
- Barcode scanning and multiple selling points.
- Mobile Money reconciliation if it becomes a significant payment channel.

## Production data model

- `users` and `business_memberships`
- `products` and `product_prices`
- `sales` and `sale_items`
- `expenses`
- `purchases` and `purchase_items`
- `stock_movements` for sale, purchase, return, damage and adjustment events
- `daily_closures` for expected cash, actual cash and variance
- `sync_operations` for idempotent offline synchronization
- `audit_events` for append-only create, update and void history

## Current prototype limitations

The current app stores demo data on one browser using `localStorage`. It has no login, cloud backup, cross-device sync or production audit trail, so it must not yet be used as Dawfuzy's sole accounting record. Product names, prices and opening stock are illustrative and must be confirmed before a real pilot.

## Backend (Supabase)

The app runs **local-only by default** — no credentials, fully offline, exactly as before.
Adding Supabase turns on multi-device sync and makes the admin/user roles real.

### Setup

1. Create a project at supabase.com.
2. Run `supabase/schema.sql` in the SQL editor. It creates `profiles`, `products`
   and `sales`, the RLS policies, and the cost-free `*_public` views.
3. **Authentication → Providers → Email: turn off "Confirm email."** Sign-in uses
   synthetic `name@dawfuzy.local` addresses that cannot receive mail.
4. Copy `.env.example` to `.env.local` and fill in the project URL and anon key.
5. Restart the dev server, add yourself from the sign-in screen, then promote:
   `update public.profiles set role = 'admin' where name = 'Owner';`

### How syncing works

Writes always hit local storage first, so the UI never waits on the network.
Each sale carries a client-generated UUID and is queued in an outbox; the queue is
flushed on save, on reconnect, and on load. Because sales are immutable and keyed by
UUID, re-sending one is harmless — the upsert simply overwrites an identical row.

Cost prices are protected server-side, not just hidden in the UI: users read from
`products_public` / `sales_public`, which do not contain the cost columns.
