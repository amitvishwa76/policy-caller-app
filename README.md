# Policy Due Desk

A Next.js dashboard that reads your Supabase `policy_list` table, lets you filter
policies whose premium is due within a configurable number of days, and pushes
those policies into a Genesys Cloud outbound calling list (manually or on a
schedule).

## What's inside

```
app/
  page.tsx                     Home page (renders the Dashboard)
  layout.tsx / globals.css     Root layout + design tokens
  api/
    policies/route.ts          GET  - fetch all rows, or ?days=60&onlyPending=true
    genesys/sync/route.ts      POST - manual sync trigger
    settings/route.ts          GET/POST - automatic sync settings
    cron/sync/route.ts         GET  - Vercel Cron target (checks if a run is due)
components/
  Dashboard.tsx                Client-side orchestration (fetch, filter state)
  PolicyTable.tsx              Renders the 7 requested columns
  StatusPill.tsx                Small status badge
  SyncPanel.tsx                Days-ahead filter, manual sync button, frequency picker
lib/
  supabase.ts                  Server-side Supabase client (service role key)
  genesys.ts                   Genesys OAuth + contact-list insert
  date.ts                      Parses "18 Jun 2026"-style due_date strings
  types.ts                     Shared TS types
supabase/migrations.sql        SQL for the two extra tables this app needs
vercel.json                    Cron schedule config
.env.example                  All required environment variables
```

Your `policy_list` table is read-only from this app's point of view - nothing
here writes to it.

## 1. Set up Supabase

1. In the Supabase SQL editor, run `supabase/migrations.sql`. This creates:
   - `sync_settings` - one row holding your automatic-sync frequency, days-ahead
     value, and "only pending" toggle.
   - `sync_log` - a history of manual and automatic sync attempts (useful for
     debugging Genesys issues later).
2. Grab your **Project URL** and **service role key** from
   Project Settings -> API. The service role key is required because this app's
   API routes run server-side and need to read the table regardless of any
   Row Level Security policy - never expose that key to the browser (it isn't;
   it's only read inside `app/api/**` files).

## 2. Set up Genesys Cloud

1. In Genesys Cloud Admin -> Integrations -> OAuth, create a **Client Credentials**
   grant client. Note the Client ID and Client Secret.
2. Find or create the **Outbound -> Contact List** you want policies inserted
   into. Note its Contact List ID (visible in the list's URL or via the API).
3. Check that list's configured columns. This app currently sends:
   `Phone, PolicyNo, PolicyHolder, Plan, Amount, DueDate, PaymentStatus`
   - open `lib/genesys.ts` -> `policyToGenesysContact()` and adjust the keys to
   match your list's actual column names exactly (case-sensitive) if they differ.
4. Your org is on the **Mumbai (ap-south-1)** region, so `GENESYS_REGION_DOMAIN`
   should stay `aps1.pure.cloud` - that's already the default in the code.

## 3. Configure environment variables

Copy `.env.example` to `.env.local` and fill in:

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GENESYS_CLIENT_ID=
GENESYS_CLIENT_SECRET=
GENESYS_REGION_DOMAIN=aps1.pure.cloud
GENESYS_CALLING_LIST_ID=
CRON_SECRET=
```

`CRON_SECRET` can be any random string - generate one with:
```
openssl rand -hex 32
```

## 4. Run locally

```
npm install
npm run dev
```

Open http://localhost:3000. You should see your live `policy_list` data. Try:
- Changing the "days ahead" number and watching the match count update.
- Ticking "Due-soon only" to filter the table view.
- Clicking "Send matching policies to Genesys" and confirming contacts appear
  in your Genesys contact list.
- Setting the automatic frequency to "Once daily" (this won't actually fire
  until deployed with Vercel Cron running - see below).

## 5. Deploy to Vercel

1. Push this project to a GitHub repo, then import it in Vercel
   (or run `vercel` from the project root).
2. In the Vercel project's Settings -> Environment Variables, add every variable
   from `.env.local`.
3. Vercel will automatically pick up `vercel.json`'s cron schedule
   (`/api/cron/sync` every 6 hours) once deployed.

   **Note:** Vercel's **Hobby plan only allows cron jobs to run once per day**,
   regardless of what `vercel.json` requests. If you're on Hobby, "Twice daily"
   in the app's settings will effectively behave like "Once daily" until you
   upgrade to Pro. "Once daily" and "Off" work fine on Hobby.
4. Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` on
   cron-triggered requests once `CRON_SECRET` is set as an env var - that's
   what `/api/cron/sync` checks to reject non-Vercel callers.

## Notes / things worth double-checking before relying on this

- `due_date` is stored as **text** (e.g. `"18 Jun 2026"`), not a native date
  type. `lib/date.ts` parses that specific format; if any rows use a different
  format the row is simply excluded from due-soon matching rather than causing
  an error - worth spot-checking your data for format consistency.
- The Genesys contact-list field mapping in `lib/genesys.ts` is my best guess
  based on the columns you described. Confirm it against your actual list
  before relying on production data.
- The manual sync currently re-inserts the same policies every time you click
  it (Genesys's add/update endpoint updates existing contacts by matching
  fields rather than erroring on duplicates), so clicking twice won't create
  duplicate calling-list entries - but it's still worth a first real test with
  a couple of rows before pointing it at your full pending list.
