# Deploying to Cloudflare Pages

Tiny Town Explorers is a static PWA: no server, no database, no runtime
environment. `pnpm build` emits everything the game needs into `dist/`, and
Cloudflare Pages serves that directory from its edge. After the first visit the
service worker has the whole game precached, so it plays with no network at all.

Everything below is a one-time setup. After that, every push to `main` deploys
itself.

## Before you start

- A Cloudflare account (the free plan is enough — Pages is unmetered for static
  assets).
- The repository hosted on GitHub or GitLab. Pages deploys from a git host, not
  from a local folder; if the repo is still local, push it first.
- Node and pnpm are pinned by the repo (`engines.node >= 24`,
  `packageManager: pnpm@12.4.1`), so the build does not need a version chosen by
  hand. The one thing worth setting explicitly is the Node major, below.

## Check the production build first

A dev server passing is not the same as a built site passing — the service
worker only exists in production output.

```powershell
pnpm install
pnpm check           # biome
pnpm typecheck       # tsc --noEmit
$env:CI="true"; pnpm test
pnpm build           # emits dist/, dist/sw.js, dist/manifest.webmanifest
pnpm preview         # serve the built output on http://localhost:4173
```

`pnpm preview` is the closest thing to the deployed site: load it, play for a
minute, then go offline (DevTools → Network → Offline, or airplane mode) and
reload. The game must still start. If it does not, the service worker precache
is the problem, not Cloudflare.

The build should report `precache 49 entries` at roughly 4.15 MiB. That is the
whole game — the town, both kits' models, the audio and the code — and it is
what makes the offline pillar work.

## First deploy

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git**.
2. Authorise Cloudflare for the host and pick the `tiny-town-explorer`
   repository.
3. **Set up builds and deployments** — the settings that matter:

   | Setting | Value |
   | --- | --- |
   | Production branch | `main` |
   | Framework preset | None (it is a plain Vite build) |
   | Build command | `pnpm build` |
   | Build output directory | `dist` |
   | Root directory | the repo root (leave empty) |

4. **Environment variables** (Production *and* Preview):

   | Name | Value | Why |
   | --- | --- | --- |
   | `NODE_VERSION` | `24` | The repo requires Node 24 or newer. |

   pnpm needs nothing else: Pages sees `pnpm-lock.yaml` and the
   `packageManager` field and uses pnpm with the pinned version. If a build ever
   fails with a missing/incorrect pnpm, add `PNPM_VERSION` = `12.4.1` and
   redeploy.

5. **Save and Deploy.** The first build takes a couple of minutes. When it
   finishes you get a URL like `https://tiny-town-explorer.pages.dev`.

## After it is live

Open the URL on the tablet itself — the acceptance criteria that matter most
(audio unlocking on the first tap, the touch targets, the frame rate) cannot be
judged from a desktop.

- The game starts on a sky-blue field with the fire truck on the road.
- The first tap makes a sound. If it does not, the browser refused to start
  audio before a gesture; tap once more and check the mute button.
- **Add to Home Screen** from the share sheet (Safari) or the menu (Chrome). The
  installed app opens full screen with no browser chrome — that is
  `display: standalone` doing its job, and the animated hint that points at the
  share control only appears when the game is *not* already installed.
- Close it, turn off Wi-Fi, reopen it. It must play offline.

## Every deploy after that

Push to `main`. Pages builds and deploys automatically, and the service worker
updates itself on the next load (`registerType: 'autoUpdate'`). One consequence
worth knowing: an already-open tab keeps the old service worker until it is
closed and reopened — so after deploying a change, close the app fully (or
hard-refresh) before judging it.

## Custom domain

Optional. Pages → your project → **Custom domains** → add the domain and follow
the DNS instructions. Nothing in the app depends on the hostname (`scope` and
`start_url` are `/`), so this needs no code change.

## When something goes wrong

- **Build fails on Node version** — `NODE_VERSION` is missing or older than 24.
- **Build fails resolving pnpm** — add `PNPM_VERSION` = `12.4.1`.
- **The site loads but the game never appears** — the page shows a bouncing toy
  car that never goes away, and then a round-arrow retry button. A failed asset
  fetch during the first load now stops the game on purpose rather than hanging:
  tap the retry button to reload. To find out *which* file is missing, open the
  browser console — the failed request is logged there. Since assets are emitted
  individually (`assetsInlineLimit: 0`), a missing asset is a 404 in the Network
  tab rather than a corrupted bundle.
- **One sound is silent but everything else works** — a sampled sound failed to
  load. Optional audio degrades to silence on purpose: the game still starts and
  the synthesized sounds still play. A missing file shows up in the console as a
  404 like any other asset; a file that downloads and then fails to decode is
  swallowed by the loader, so the console is empty and the symptom is just the
  one missing sound.
- **A stale build keeps serving** — close the tab and reopen it. Pages keeps a
  deployment history, so you can also roll back to an older deployment from the
  project's Deployments tab if a release is bad.

## If the dashboard hands you a Worker instead

Cloudflare's new-project flow can create a **Worker** rather than a Pages
project. Everything then looks fine until the very last step: the build succeeds,
and the *deploy* fails, because the Workers flow wants to own your Vite config —
it tries to add `wrangler` and `@cloudflare/vite-plugin` and rewrite
`package.json` during deploy, which dies on the frozen lockfile:

```
Error: ERR_PNPM_IGNORED_BUILDS
  Ignored build scripts: esbuild@0.28.1, workerd@1.20260918.1
```

Read that as Cloudflare editing the repository at deploy time, not as a fault in
the game: the `pnpm build` immediately before it passed, and the log above it
shows every asset emitted and the service worker precaching. This app is a
static PWA — it has no worker runtime, no bindings and no server code, so there
is nothing for a Worker to do.

Cancel that project and create a Pages project instead. There is no deploy
command in the Pages flow, so nothing is installed at deploy time and the
repository is never modified by a build.

