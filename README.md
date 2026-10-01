# Corpse Club

A mobile-first PWA for playing [exquisite corpse](https://en.wikipedia.org/wiki/Exquisite_corpse) with friends. Three people each draw one part of a creature (head, torso, legs) on paper, photograph it, and pass it on. Each hand sees only a thin strip of the previous drawing. When the third section is sealed, everyone is summoned to the reveal.

No accounts. Turns are handed over with invite links, devices are tracked with a random ID, and Web Push tells people when it is their move.

## Stack

| Layer              | Technology                                                        |
| ------------------ | ----------------------------------------------------------------- |
| Frontend           | SvelteKit (Svelte 5, runes)                                       |
| Hosting            | Cloudflare Pages via `@sveltejs/adapter-cloudflare`               |
| API                | SvelteKit server routes, running on Workers                       |
| Database           | Cloudflare D1                                                     |
| Images             | Cloudflare R2                                                     |
| Push notifications | Web Push with VAPID, implemented on WebCrypto                     |
| Scheduled jobs     | Companion Worker with a cron trigger (`workers/cron`)             |
| PWA                | SvelteKit service worker and a per-device `/manifest.webmanifest` |

### How the pieces fit

```
Browser ──► Pages (SvelteKit) ──► D1  (corpses, sections, subscriptions)
                    │         └─► R2  (section images, overlap strips, assembled image)
                    └─ Web Push ─► browser push services

Cron Worker (hourly) ──► same D1 ──► reminders, expiry, Web Push
```

Cloudflare Pages has no cron triggers, so the hourly reminder job lives in a small separate Worker (`workers/cron`). It binds the same D1 database and imports the same server modules from `src/lib/server`.

## Local development

Requirements: Node 22+ and npm.

```sh
npm install

# 1. VAPID keys for Web Push
npm run vapid
#   Put VAPID_PUBLIC_KEY into [vars] in wrangler.toml and workers/cron/wrangler.toml.
#   Put the private key in .dev.vars:
cp .dev.vars.example .dev.vars   # then paste VAPID_PRIVATE_KEY=...

# 2. Local D1 database (stored under .wrangler/)
npm run db:migrate:local

# 3. Run the app
npm run dev
```

`vite dev` uses Wrangler's platform proxy, so `platform.env.DB` and `platform.env.BUCKET` are backed by local D1 and R2 simulators. The camera needs a secure context: `localhost` works, but to test on a phone over your LAN use an HTTPS tunnel such as `cloudflared tunnel --url http://localhost:5173`.

### Reminders and push locally

```sh
npm run cron:dev                     # cron Worker on :8799, sharing local D1
curl "http://localhost:8799/__scheduled?cron=0+*+*+*+*"   # trigger a run
```

`scripts/push-sink.mjs` is a stand-in push service. It prints a subscription (endpoint and keys) you can insert into `push_subscriptions` in the local database, then decrypts and logs every notification it receives:

```sh
node scripts/push-sink.mjs 8800
```

### Checks

```sh
npm run check   # svelte-check and TypeScript
npm test        # Vitest: Web Push crypto against the http_ece reference, access rules
npm run lint    # Prettier
```

## Deploying to Cloudflare

```sh
npx wrangler login

# D1: copy the printed database_id into BOTH wrangler.toml and workers/cron/wrangler.toml
npx wrangler d1 create corpse-club
npm run db:migrate:remote

# R2
npx wrangler r2 bucket create corpse-club-images

# Pages project (first time only)
npx wrangler pages project create corpse-club --production-branch main

# Secrets: the same VAPID private key for the app and the cron Worker
npx wrangler pages secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_PRIVATE_KEY --config workers/cron/wrangler.toml

# Ship it
npm run deploy        # builds and deploys the Pages app
npm run cron:deploy   # deploys the hourly cron Worker
```

Also update `VAPID_SUBJECT` in both Wrangler configs to a `mailto:` or `https:` address you control. Push services use it to contact you.

If you connect the GitHub repository to Pages for automatic builds, use `npm run build` as the build command and `.svelte-kit/cloudflare` as the output directory. Bindings come from `wrangler.toml`. Set `VAPID_PRIVATE_KEY` as an encrypted variable in the dashboard.

### Rate limiting

Write endpoints (create, submit, subscribe, assembled upload) have a fixed-window limiter backed by D1 (`rate_limits` table, keyed by client IP). The cron job prunes old windows. For more protection, add a WAF rate limiting rule in the dashboard, for example 60 requests per minute per IP on `/api/*`.

## How it works

### The flow

1. **Summon** (`POST /create`): creates a corpse and three sections, each with its own `crypto.randomUUID()` invite token, then redirects the creator to `/draw/<token-1>`.
2. **Draw**: on paper with the camera (primary), on screen (fallback), or by uploading a photo.
3. **Seal** (`POST /api/draw/[token]/submit`): uploads the section and, for sections I and II, a separate image of just its bottom strip. The creator gets the next invite link and the native share sheet.
4. **Pass on**: the next hand opens the link and sees only the strip. When they seal, the creator is summoned to invite the last hand.
5. **Reveal**: when section III is sealed, every subscribed participant is summoned to `/c/<id>`.

### Secrecy

- The next hand never receives the full previous section, only the strip image uploaded alongside it (`corpses/{id}/section-{n}-overlap.webp`), served by `/api/draw/[token]/overlap` while that token is open.
- Full section images are served only once the corpse is complete, or to the device that drew them.
- Invite tokens are returned only to the creator's device. Responses set `Referrer-Policy: no-referrer` so tokens don't leak through links.
- Push endpoints are never returned by any API.

### Images

- Sections are normalised to 1000×750 in the browser, with the bottom 60 px as the overlap strip. They are encoded as WebP, or JPEG on Safari, which cannot encode WebP from a canvas. Typical uploads are well under the 2 MB limit.
- The server checks the declared content type, the magic bytes, and the size.
- Paper photos are cropped to the framing guide, can be panned, scaled and tilted, and are optionally "bleached": per-channel levels push the paper to white and the ink to black.
- **Assembly**: Workers have no canvas, so the first participant to view the reveal composites the three sections in their browser and uploads `corpses/{id}/assembled.webp` once. Until that happens, `GET /api/corpse/[id]/image` builds an SVG on the fly that stacks the three sections. Downloads are composited client-side as PNG.

### Camera overlay

`getUserMedia({ video: { facingMode: 'environment' } })` fills the screen. A framing guide in the section's aspect ratio sits in the middle, and the previous strip is drawn just above its top edge. It is converted to transparent red ink so it stays visible over white paper. Tap the strip to hide or show it. Line up the paper's top edge with the guide, continue the red lines, and capture.

### Devices

On first visit the server sets a random device ID cookie (`cc_device`), which the client mirrors into `localStorage`. If the cookie is lost, `localStorage` restores it. API routes also accept an `x-device-id` header. **My Corpses** lists every corpse the device created or drew in, including expired ones, marked as rotted.

### Push and iOS

Permission is requested only after a section is sealed, in response to a tap ("Summon me"). Subscriptions are stored per corpse and device. On iOS, Web Push only works for Home Screen apps, so on iOS Safari the prompt explains how to install. Home Screen apps on iOS don't share storage with Safari. To carry the device ID across, each page links to `/manifest.webmanifest?mark=<id>` (manifests are fetched without cookies), and the manifest's `start_url` is `/my-corpses?mark=<id>`. On its first standalone launch the installed app adopts that mark, then strips it from the URL. Normal browser tabs ignore the parameter. If the mark doesn't make it across, **My Corpses** still lets you copy it by hand and adopt it in the installed app.

Notifications are sent when:

- a section is sealed: to the creator ("Section II is drawn. Invite the last hand.")
- the corpse is complete: to all subscribed participants
- a reminder is due: to the creator, 48 hours after a section becomes drawable and again 24 hours later
- a corpse expires: to the creator, 24 hours after the second reminder

### Data model

`migrations/0001_init.sql` follows the spec, with two additions:

- `sections.activated_at`: when a section became drawable (corpse creation for section I, the previous section's completion otherwise). Reminder timing is measured from this, since sections have no `created_at`.
- `rate_limits`: counters for the D1 rate limiter.

There are also indexes for lookups by device and active sections, and a unique `(corpse_id, endpoint)` index on subscriptions.

## API

| Method | Route                                 | Description                                                     |
| ------ | ------------------------------------- | --------------------------------------------------------------- |
| POST   | `/api/corpse`                         | Create a corpse; returns `corpseId` and the section I `drawUrl` |
| GET    | `/api/corpse/[id]`                    | Status and metadata (the invite path only for the creator)      |
| GET    | `/api/corpse/[id]/image`              | Assembled image (stored WebP, or an on-the-fly SVG stack)       |
| POST   | `/api/corpse/[id]/image`              | Participant uploads the composited image (once)                 |
| GET    | `/api/corpse/[id]/section/[position]` | One section image (after completion, or to its own drawer)      |
| GET    | `/api/draw/[token]`                   | Section info and draw state for an invite token                 |
| GET    | `/api/draw/[token]/overlap`           | The previous section's strip, while the token is open           |
| POST   | `/api/draw/[token]/submit`            | Seal a section (`image`, `overlap`, optional `name`)            |
| POST   | `/api/push/subscribe`                 | Store a push subscription for a corpse                          |
| GET    | `/api/my-corpses`                     | Corpses for the current device (cookie or `x-device-id`)        |

## Pages

| Route            | Description                                                       |
| ---------------- | ----------------------------------------------------------------- |
| `/`              | Landing page with "Summon a corpse"                               |
| `/create`        | Creates a corpse (form POST) and starts section I                 |
| `/draw/[token]`  | Drawing flow for one section                                      |
| `/c/[id]`        | Reveal page and permalink (redirects to status while in progress) |
| `/c/[id]/status` | Progress; the creator gets the current invite link here           |
| `/my-corpses`    | Personal gallery and device mark                                  |
| `/offline`       | Prerendered offline fallback used by the service worker           |

## Project layout

```
migrations/            D1 schema
scripts/               VAPID keys, icon rendering, local push sink
src/
  hooks.server.ts      device identity and security headers
  service-worker.ts    app shell cache, push, notification clicks
  lib/
    components/        DrawingCanvas, CameraCapture, ImageAdjust, Reveal, ...
    server/            D1 access, Web Push, notifications, reminders (shared with the cron Worker)
    image.ts           client-side encoding, cropping, bleaching, assembly
  routes/              pages and API routes
static/                icons
workers/cron/          hourly reminder and expiry Worker
wrangler.toml          Pages config: D1, R2, vars
```

## Scripts

| Script                      | What it does                                         |
| --------------------------- | ---------------------------------------------------- |
| `npm run dev`               | Dev server with local D1 and R2                      |
| `npm run build`             | Production build into `.svelte-kit/cloudflare`       |
| `npm run preview`           | Build, then serve with `wrangler pages dev`          |
| `npm run deploy`            | Build and deploy to Cloudflare Pages                 |
| `npm run cron:dev`          | Run the cron Worker locally against local D1         |
| `npm run cron:deploy`       | Deploy the cron Worker                               |
| `npm run db:migrate:local`  | Apply migrations locally                             |
| `npm run db:migrate:remote` | Apply migrations to the production D1                |
| `npm run vapid`             | Generate a VAPID key pair                            |
| `npm run icons`             | Re-render the PWA icons                              |
| `npm run gen`               | Regenerate `worker-configuration.d.ts` binding types |
