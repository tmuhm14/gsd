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

### Jira lookup

With `JIRA_BASE_URL`, `JIRA_EMAIL` and `JIRA_API_TOKEN` set, the actions get a
read-only `jira_lookup` tool. When a note mentions an issue key like `WH-1234`,
Claude can fetch that ticket's summary, status, assignee, description and
recent comments before answering. One operation only — it cannot search, write
or transition anything. Without the env vars the tool is never offered.

> **PHI warning.** Waltz is a HIPAA-covered entity and Jira issues can contain
> patient detail in descriptions and comments. This fetches those fields and
> sends them to the Anthropic API. Ticket content is never written to logs
> (the error paths deliberately exclude response bodies), but it does leave
> your infrastructure. Confirm this fits your BAA before configuring it.

## Sync with the macOS app

The macOS client pushes and pulls through `POST /api/sync` — one round trip
does both. Contract: [`docs/api/sync.yaml`](docs/api/sync.yaml).

Two rules:

- **Last write wins, per item, by `updatedAt`.** Ties go to the server, so
  repeated syncs settle instead of flip-flopping. A rejected push comes back
  in `conflicts` for the client to adopt.
- **The cursor is `server_seq`, not a timestamp.** A database trigger bumps it
  on every write. Two clocks that disagree by a second would silently skip
  rows at a timestamp boundary; a sequence is assigned by one authority and
  only moves forward.

Deletes are tombstones (`deleted_at`). A hard delete would be re-created by
the other client on its next push.

Apply `db/sql/002_sync.sql` before first use. Images do **not** sync — they
live on the Mac's disk, so a note with an image syncs its text and shows the
raw markdown here.

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

- Image sync (attachments are Mac-only; text syncs fine).
- Weekly review and drag-and-drop between buckets on the web.
