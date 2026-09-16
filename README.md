# task-notes-web

Web and mobile companion to the macOS **GTD Notes** app. Same Getting Things
Done model, same markdown note format, deployed to Vercel on Neon Postgres.

The macOS app lives in `../task-notes-app`.

## Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router), TypeScript strict |
| API | tRPC v11 — every mutation and query goes through it |
| ORM | Drizzle (schema mirrors the live database) |
| Database | Neon Postgres (serverless HTTP driver) |
| Styling | Tailwind CSS v4 |
| Auth | Single user: scrypt password + encrypted `iron-session` cookie |
| Tests | Vitest |
| Package manager | pnpm |

## Mobile

This is a mobile-first responsive PWA, not a native app. It's installable to an
iOS or Android home screen via the web manifest, and the layout collapses to a
single column with a list/detail push navigation on phones.

## Getting started

```bash
pnpm install
```

Generate secrets and put them in `.env.local` (see `.env.example`):

```bash
pnpm tsx scripts/hash-password.ts "your-password"
```

Create the database on [Neon](https://neon.tech), then apply the schema. DDL is
applied manually per Waltz conventions — the Drizzle schema files mirror the
database rather than generating it:

```bash
psql "$DATABASE_URL" -f db/sql/001_init.sql
```

```bash
pnpm dev
```

## Commands

```bash
pnpm dev        # dev server on :3000
pnpm build      # production build
pnpm typecheck  # tsc --noEmit
pnpm test       # vitest
pnpm lint       # eslint
```

## Deploying to Vercel

1. Push this repo to GitHub.
2. Import it in Vercel — the framework preset is detected automatically.
3. Add the four environment variables from `.env.example` to the Vercel
   project (Production and Preview).
4. Deploy.

Use Neon's **pooled** connection string. The app uses Neon's HTTP driver, which
suits serverless functions — there's no long-lived pool to exhaust across cold
starts.

## AI actions

Open a note, tap ⚙ to show the properties panel, and the AI actions sit beneath
it: **Clarify**, **Break into next actions**, **Research** (web search), and
**Summarize**. Results are proposed in a panel with Apply and Discard.

Set `ANTHROPIC_API_KEY` to enable them. Without it the app runs normally and the
panel says AI is off.

## Architecture notes

**The body's first line is the title.** `title` is stored as a derived cache so
lists and search don't reparse every note, and it is recomputed server-side on
every write — a client cannot set it directly.

**Deletes are two-stage.** `trash` moves an item to the trash bucket
(recoverable). `destroy` sets `deleted_at`, tombstoning the row rather than
removing it, so a delete can propagate to another client instead of the row
reappearing at the next sync.

**Markdown parsing is duplicated, deliberately.** `src/lib/markdown.ts` is a
port of the macOS app's `Markdown` enum. Both clients must agree on what a line
means — a checkbox ticked on the phone has to read as ticked on the Mac — so
the logic is mirrored rather than allowed to diverge.

**The AI layer cannot write to the database.** `ai.run` loads a note, calls
Claude, and returns a *proposal*. Applying it goes through the ordinary
`items.update` mutation, so there is one write path, the user commits every
change, and a prompt-injected response cannot quietly edit a note. Note text is
fenced in `<note>` tags and the system prompt states that its contents are data,
never instructions. `applyProposal` only ever appends sections — tests assert
that no action can drop text the user wrote.

**`session.ts` and `password.ts` are separate on purpose.** Edge middleware
imports the session config; `node:crypto` is not available there, so pulling
password hashing into middleware breaks the build.

## Not built yet

- **Sync with the macOS app.** The schema is ready for it (client-generatable
  UUID keys, `updated_at` as the last-write-wins key, delete tombstones), but
  the Mac app still reads and writes its local JSON file. Nothing syncs today.
- Weekly review, drag and drop between buckets, image attachments.
