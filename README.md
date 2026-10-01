# Corpse Club

A mobile-first PWA for playing [exquisite corpse](https://en.wikipedia.org/wiki/Exquisite_corpse) with friends. Three people each draw one part of a creature (head, torso, legs) on paper, photograph it, and pass it on. Each hand sees only a thin strip of the previous drawing. When the third section is sealed, everyone is summoned to the reveal.

No accounts. Turns are handed over with invite links, devices are tracked with a random ID, and Web Push tells people when it is their move.

## Stack

| Layer              | Technology                                                                   |
| ------------------ | ---------------------------------------------------------------------------- |
| Frontend           | SvelteKit (Svelte 5, runes)                                                  |
| Hosting            | One Cloudflare Worker with static assets, via `@sveltejs/adapter-cloudflare` |
| API                | SvelteKit server routes                                                      |
| Database           | Cloudflare D1                                                                |
| Images             | Cloudflare R2 for storage, Cloudflare Images for assembling the corpse       |
| Push notifications | Web Push with VAPID, implemented on WebCrypto                                |
| Scheduled jobs     | Cron trigger on the same Worker                                              |
| PWA                | SvelteKit service worker and a per-device `/manifest.webmanifest`            |

### How the pieces fit

```
Browser ──► Worker ── fetch: SvelteKit ──► D1      (corpses, sections, subscriptions)
              │                       ├──► R2      (section images, overlap strips, assembled image)
              │                       ├──► Images  (stacks the three sections into one WebP)
              │                       └──► Web Push services
              └────── scheduled (hourly) ──► reminders, expiry, Web Push
```

The adapter writes its worker to `.svelte-kit/cloudflare/_worker.js`. `workers/app.ts` is the real entry: it reuses that worker's `fetch` and adds a `scheduled` handler for the hourly job. Because the adapter writes to whatever `main` its Wrangler config names, it reads a small separate config (`wrangler.adapter.toml`), while `wrangler.toml` holds the deployable Worker. The generated worker is imported through the `sveltekit-worker` alias, so TypeScript doesn't check the generated bundle.

## Local development

Requirements: Node 22+ and npm.

```sh
npm install

# 1. VAPID keys for Web Push
npm run vapid
#   Put VAPID_PUBLIC_KEY into [vars] in wrangler.toml.
#   Put the private key in .dev.vars:
cp .dev.vars.example .dev.vars   # then paste VAPID_PRIVATE_KEY=...

# 2. Local D1 database (stored under .wrangler/)
npm run db:migrate:local

# 3. Run the app
npm run dev
```

`vite dev` uses Wrangler's platform proxy, so `platform.env.DB` and `platform.env.BUCKET` are backed by local D1 and R2 simulators. The Images binding is `remote = true`, so dev uses the real service: the offline emulation ignores `draw()` and would store a corpse with only its head. This needs `wrangler login`, and each completed corpse counts as one transformation. The camera needs a secure context: `localhost` works, but to test on a phone over your LAN use an HTTPS tunnel such as `cloudflared tunnel --url http://localhost:5173`.

### Reminders and push locally

```sh
npm run preview                      # build, then run the real Worker on :8787
curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"   # trigger a cron run
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

# D1: copy the printed database_id into wrangler.toml
npx wrangler d1 create corpse-club --location weur
npm run db:migrate:remote

# R2 (enable R2 in the dashboard first)
npx wrangler r2 bucket create corpse-club-images --location weur

# Ship it (builds, then deploys the Worker with its assets and cron trigger)
npm run deploy

# Secret: the VAPID private key
npx wrangler secret put VAPID_PRIVATE_KEY
```

The app lives at [corpse-club.joris.wtf](https://corpse-club.joris.wtf), attached as a Worker custom domain in `routes`. The `workers.dev` and preview URLs are disabled. Device marks, Home Screen installs and push subscriptions are tied to one origin, so a second public address would split people's corpses. `VAPID_SUBJECT` is the same URL. Push services use it to contact you.

Cloudflare Images needs no setup: the Free plan allows 5,000 unique transformations a month, and each completed corpse uses one. Beyond that, new transformations fail (no charge), and the app falls back to the browser upload described under Images.

For automatic deploys, connect the repository with [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/), using `npm run build` as the build command and `npx wrangler deploy` as the deploy command.

### Rate limiting

Write endpoints (create, submit, subscribe, assembled upload) have a fixed-window limiter backed by D1 (`rate_limits` table, keyed by client IP). The cron job prunes old windows. For more protection, add a WAF rate limiting rule in the dashboard, for example 60 requests per minute per IP on `/api/*`.

## How it works

### The flow

1. **Summon** (`POST /create`): creates a corpse and three sections, each with its own `crypto.randomUUID()` invite token, then redirects the creator to `/draw/<token-1>`.
2. **Draw**: on paper with the camera (primary) or on screen (fallback). There is no photo upload: only the live camera overlay and the on-screen canvas show the previous edge while drawing, so lines can meet.
3. **Seal** (`POST /api/draw/[token]/submit`): uploads the section and, for sections I and II, a separate image of just its bottom strip. Whoever sealed it gets the next invite link and the native share sheet.
4. **Pass on**: the next hand opens the link and sees only the strip. When they seal, they get the last invite link and pass it on, like the folded paper.
5. **Reveal**: when section III is sealed, every subscribed participant is summoned to `/c/<id>`.

### Secrecy

- The next hand never receives the full previous section, only the strip image uploaded alongside it (`corpses/{id}/section-{n}-overlap.webp`), served by `/api/draw/[token]/overlap` while that token is open.
- Full section images are served only once the corpse is complete, or to the device that drew them.
- An invite token is returned only to the hand that sealed the section before it, and to the creator's device. Responses set `Referrer-Policy: no-referrer` so tokens don't leak through links.
- Push endpoints are never returned by any API.

### Images

- Sections are normalised to 1000×750 in the browser, with the bottom 60 px as the overlap strip. They are encoded as WebP, or JPEG on Safari, which cannot encode WebP from a canvas. Typical uploads are well under the 2 MB limit.
- The server checks the declared content type, the magic bytes, and the size.
- Paper photos are cropped to the framing guide, can be panned, scaled and tilted, and are optionally "bleached": per-channel levels push the paper to white and the ink to black.
- **Assembly**: when section III is sealed, the Worker stacks the three sections into a single 1000×2250 WebP with the Images binding and stores it as `corpses/{id}/assembled` (`src/lib/server/assemble.ts`). `GET /api/corpse/[id]/image` retries if that failed. If Images is unavailable (for example over the free quota), the first participant to view the reveal composites the sections in their browser and uploads them once. Until then, the endpoint serves an SVG that stacks the three sections. Downloads are composited client-side as PNG.

### Camera overlay

`getUserMedia({ video: { facingMode: 'environment' } })` fills the screen. A framing guide in the section's aspect ratio sits in the middle, and the previous strip is drawn just above its top edge. It is converted to transparent red ink so it stays visible over white paper. Tap the strip to hide or show it. Line up the paper's top edge with the guide, continue the red lines, and capture.

### Devices

On first visit the server sets a random device ID cookie (`cc_device`), which the client mirrors into `localStorage`. If the cookie is lost, `localStorage` restores it. API routes also accept an `x-device-id` header. **My Corpses** lists every corpse the device created or drew in, including expired ones, marked as rotted.

### Push and iOS

Permission is requested only after a section is sealed, in response to a tap ("Summon me"). Subscriptions belong to the device, not the corpse: one "Summon me" covers every corpse the device creates or draws in. Each endpoint is stored once and follows whichever mark registered it last, so adopting a mark re-registers the browser's subscription.

On iOS, Web Push only works for Home Screen apps (iOS 16.4 and later). An iPhone hand in a browser tab whose device has no subscription yet is asked to add Corpse Club to the Home Screen before drawing, with steps for their browser (Safari, Chrome, or a generic menu). "Draw without summons" skips this. Once any browser on the device has subscribed, for example the installed app, the gate and the prompt stand aside, because summons already reach that device. Embedded browsers of social apps (Instagram, Facebook, TikTok and others) can neither install nor receive push, so they are told to open the page in Safari or the system browser first.

Home Screen apps on iOS don't share storage with Safari. To carry the device ID across, each page links to `/manifest.webmanifest?mark=<id>&next=<path>` (manifests are fetched without cookies), and the manifest's `start_url` is `/my-corpses?mark=<id>&next=<path>`. `next` is the draw, status or reveal page the app was added from. On its first standalone launch the installed app adopts the mark and opens `next`; later launches ignore both and strip them from the URL. Normal browser tabs ignore the parameters. If the mark doesn't make it across, **My Corpses** still lets you copy it by hand and adopt it in the installed app.

Notifications are sent when:

- the corpse is complete: to every participant who has subscribed, except the hand who just unfolded it
- a reminder is due: to the creator and the previous hand, 48 hours after a section becomes drawable and again 24 hours later
- a corpse expires: to the creator and the previous hand, 24 hours after the second reminder

Turns never depend on push: each hand gets the next invite link the moment they seal.

### Data model

`migrations/0001_init.sql` follows the spec, with two additions:

- `sections.activated_at`: when a section became drawable (corpse creation for section I, the previous section's completion otherwise). Reminder timing is measured from this, since sections have no `created_at`.
- `rate_limits`: counters for the D1 rate limiter.

There are also indexes for lookups by device and active sections.

`migrations/0002_device_subscriptions.sql` moves `push_subscriptions` from per corpse to per device: one row per endpoint (unique), keyed by `device_id`. Who gets summoned for a corpse is derived from `corpses.creator_device_id` and `sections.device_id`.

## API

| Method | Route                                 | Description                                                      |
| ------ | ------------------------------------- | ---------------------------------------------------------------- |
| POST   | `/api/corpse`                         | Create a corpse; returns `corpseId` and the section I `drawUrl`  |
| GET    | `/api/corpse/[id]`                    | Status and metadata (invite path for the creator and prev. hand) |
| GET    | `/api/corpse/[id]/image`              | Assembled image (stored WebP, or an on-the-fly SVG stack)        |
| POST   | `/api/corpse/[id]/image`              | Participant uploads the composited image (once)                  |
| GET    | `/api/corpse/[id]/section/[position]` | One section image (after completion, or to its own drawer)       |
| GET    | `/api/draw/[token]`                   | Section info and draw state for an invite token                  |
| GET    | `/api/draw/[token]/overlap`           | The previous section's strip, while the token is open            |
| POST   | `/api/draw/[token]/submit`            | Seal a section (`image`, `overlap`, optional `name`)             |
| POST   | `/api/push/subscribe`                 | Store this device's push subscription                            |
| GET    | `/api/my-corpses`                     | Corpses for the current device (cookie or `x-device-id`)         |

## Pages

| Route            | Description                                                       |
| ---------------- | ----------------------------------------------------------------- |
| `/`              | Landing page with "Summon a corpse"                               |
| `/create`        | Creates a corpse (form POST) and starts section I                 |
| `/draw/[token]`  | Drawing flow for one section                                      |
| `/c/[id]`        | Reveal page and permalink (redirects to status while in progress) |
| `/c/[id]/status` | Progress; the creator and previous hand get the invite link here  |
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
    server/            D1 access, Web Push, notifications, reminders, Images assembly
    image.ts           client-side encoding, cropping, bleaching, assembly
  routes/              pages and API routes
static/                icons and favicon.ico (rendered by `npm run icons`)
workers/app.ts         Worker entry: SvelteKit fetch plus the hourly cron
wrangler.toml          Worker config: assets, cron, D1, R2, Images, vars
wrangler.adapter.toml  tells the adapter where to write its build
```

## Scripts

| Script                      | What it does                                         |
| --------------------------- | ---------------------------------------------------- |
| `npm run dev`               | Dev server with local D1 and R2                      |
| `npm run build`             | Production build into `.svelte-kit/cloudflare`       |
| `npm run preview`           | Build, then run the Worker with `wrangler dev`       |
| `npm run deploy`            | Build and deploy the Worker                          |
| `npm run db:migrate:local`  | Apply migrations locally                             |
| `npm run db:migrate:remote` | Apply migrations to the production D1                |
| `npm run vapid`             | Generate a VAPID key pair                            |
| `npm run icons`             | Re-render the PWA icons                              |
| `npm run gen`               | Regenerate `worker-configuration.d.ts` binding types |
