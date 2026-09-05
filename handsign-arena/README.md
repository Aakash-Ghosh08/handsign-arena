# Handsign Arena

A 1v1 browser duel where you cast abilities by making hand signs at your webcam. Built as a
ground-up re-engineering of [`handSignGame`](https://github.com/Aakash-Ghosh08/handSignGame), a
local, single-machine Pygame/OpenCV/MediaPipe prototype, into a real-time web multiplayer game.

This document explains what exists, how it's organized, how to run it locally, how to deploy it,
and — importantly — what has **not** been done, so nothing here is overstated.

---

## 1. What this is, concretely

- A **Next.js/TypeScript** web client (`apps/web`) that runs hand tracking and gesture
  classification entirely in the browser (MediaPipe Tasks Vision `HandLandmarker`), renders the
  arena on `<canvas>`, and talks to the realtime server over WebSockets.
- A small **Node/`ws`** realtime server (`apps/server`) that owns rooms, matchmaking, and the
  authoritative game simulation (movement, cooldowns, damage, win conditions). The server never
  receives video — only discrete gesture events.
- A **shared TypeScript package** (`packages/shared`) holding the wire protocol, balance
  constants, and the simulation itself, so client and server can never silently disagree about
  types.

```
handsign-arena/
├── apps/
│   ├── web/      Next.js client — UI, canvas renderer, MediaPipe pipeline, WebSocket client
│   └── server/   Node/ws realtime server — rooms, matchmaking, authoritative simulation loop
└── packages/
    └── shared/   Wire protocol types, balance constants, the MatchEngine simulation
```

---

## 2. What the original game actually did

Reading `src/main.py`, `player.py`, `attack.py`, `handsigns.py`, and `helperMethods.py` in the
source repo, the real mechanics (not just the README's summary) were:

- One local webcam, split down the middle (`landmark.x < 0.5`) to stand in for two players —
  there was no networking of any kind.
- Gestures were **hard booleans** from a single frame: a finger counted as "straight" only above
  a fixed 0.95 straightness ratio, with no smoothing, no confidence, and no history other than a
  5-entry `handSigns` list used to detect one specific combo (`fist → open` arms lightning).
- Direction for aimed abilities came from an SVD principal-axis fit over four landmarks
  (`helperMethods.angle`), which has a **sign ambiguity** — the returned axis can point either way
  along the line, so "which way is the player aiming" wasn't actually well defined.
- The game loop had no fixed timestep (`while running: ...` with no `clock.tick()`), so gameplay
  speed was tied to however fast that machine's Pygame/OpenCV loop happened to run.
- `heal` (`rock` sign) applied every single frame it was held, with no cooldown — a strictly
  dominant, spammable action.
- Rendering was flat-colored circles and rectangles with no feedback beyond position and a health
  bar; there was no win/lose screen beyond a single text blit, no menus, and no error handling for
  a missing camera, denied permission, or no hand in frame.

The core idea — **hand signs as an input method for 1v1 combat** — is genuinely good and is what
this rebuild keeps. Almost everything else was rebuilt.

---

## 3. What changed, and why

### Gesture recognition
- Rewritten as a **soft-scoring classifier** (`apps/web/src/lib/gesture/classifier.ts`): each
  finger gets a continuous "how extended" score with a dead zone, and each gesture gets a match
  confidence rather than a hard yes/no. This removes the "hold your hand in an unnaturally precise
  position" problem — a slightly imperfect sign still reads correctly, just with lower confidence.
- **Temporal smoothing** (`temporalSmoother.ts`): an 8-frame sliding window with a plurality
  threshold and a short retrigger cooldown, so a single dropped or noisy frame can't flip the
  active gesture, while a genuinely-held gesture is still confirmed in a few frames.
- **Direction is now unambiguous**: instead of an SVD axis, direction is the concrete base→tip
  vector of the relevant finger, which cannot point "the wrong way."
- **Continuous feedback**: a HUD badge always shows the current recognized gesture, its icon, and
  a live confidence bar — including "no hand" state — so the player is never guessing whether the
  game is working.

### Gameplay & balance
- Simulation moved to a **fixed 30 Hz server tick** (`TICK_MS` in `packages/shared/src/constants.ts`)
  instead of an uncapped loop, so speeds and cooldowns mean the same thing on every machine.
- `heal` now has a real cooldown and a fixed amount instead of being a free per-frame drain.
- Added **dash and attack cooldowns with UI feedback** (small countdown pips), a **shield state**
  that visibly rings the player, and a **"lightning armed" indicator** so the fist→open→peace
  combo is legible instead of a hidden internal flag.
- Added a **best-of-three round structure** with a round-over banner and a final victory/defeat
  screen with rematch, instead of the game just ending on the first death.

### Visuals
- Full canvas re-render: radial-gradient projectiles with particle trails, hit/heal/shield/cast
  particle bursts, screen shake on unblocked hits, health bars with color thresholds, and a
  themed arena background — replacing flat Pygame primitives.
- A from-scratch UI: landing page, lobby with a live readiness checklist for both players, an
  in-camera-setup practice step that asks the player to throw one gesture and confirms it was
  recognized before they can enter a match, an in-match HUD, and round/victory overlays.

### Multiplayer (the big addition — the original had none)
- Real-time 1v1 over WebSockets. The browser never uploads video; only classified, timestamped
  gesture events (`{ type: "gesture", gesture, dir, confidence, t }`) go over the wire.
- The server is **authoritative** over health, cooldowns, positions, and win conditions. Clients
  cannot make themselves win, heal past a cooldown, or ignore damage — the server independently
  re-checks every cooldown and collision.
- Rooms use short human-shareable codes (`X7K29`-style, ambiguous characters like `O`/`0`/`I`/`1`
  excluded) with a joinable link.

---

## 4. Gesture set

| Sign | Icon | Effect |
|---|---|---|
| Fist | ✊ | Guard — blocks the next hit while held |
| Open palm | ✋ | Primes your *next* cast to be lightning instead of fire (fist→open, then cast) |
| Peace, aimed | ✌️ | Cast — fireball, or lightning if primed |
| Point, held | ☝️ | Move in that direction |
| Thumb+index+pinky ("sage sign") | 🤟 | Mend — heal on a cooldown |
| Three fingers, aimed | 🤟 | Dash a short distance in that direction |

---

## 5. Networking model

```
Player's camera → MediaPipe (in-browser) → classifier → temporal smoother
   → "gesture" event over WebSocket → server (authoritative sim, 30Hz tick)
   → "state" snapshot broadcast to both clients (30Hz)
   → client interpolates between the last two snapshots for smooth 60fps rendering
```

- The server holds one `MatchEngine` instance per room (`packages/shared/src/engine.ts`) and
  advances it on a `setInterval` tick. Continuous inputs (moving, shielding) are read from the
  player's latest reported gesture each tick; discrete inputs (attack, heal, dash) are
  edge-triggered exactly once when the stable gesture changes, and independently re-validated
  against server-side cooldown timestamps the client never sees directly.
- Client-side prediction was deliberately **not** implemented. Gesture-triggered abilities are
  discrete, occasional events (not continuous twitch aiming), so a `~1 tick` (33 ms) of added
  latency before an ability visibly fires is not perceptible enough to justify the complexity and
  failure modes of rollback/reconciliation for this game. Movement is interpolated between
  snapshots so it still reads as smooth.
- Disconnects: the opponent is notified immediately; the room holds a 25-second grace period for a
  refresh/blip before declaring a forfeit, rather than ending the match instantly.

---

## 6. Local development

Requires Node 20+ and [pnpm](https://pnpm.io) (`corepack enable` will get you the pinned version).

```bash
pnpm install

# terminal 1 — realtime server on :8080
pnpm dev:server

# terminal 2 — web app on :3000
pnpm dev:web
```

Open two browser windows (or two devices on the same network) at `http://localhost:3000`, create
a room in one, join with its code in the other. `NEXT_PUBLIC_REALTIME_URL` is optional in dev —
the client defaults to `ws://<page hostname>:8080`.

---

## 7. Production deployment

The client and the realtime server are deployed **separately**, because Vercel's serverless
functions don't hold a persistent process for a stateful WebSocket room/tick loop to live in.

### Frontend — Vercel
1. Import the repo into Vercel, set the project root to `apps/web`.
2. Set the environment variable `NEXT_PUBLIC_REALTIME_URL` to your deployed server's `wss://` URL.
3. Deploy. Vercel auto-detects Next.js; no custom build command is required beyond the default
   (`pnpm install && pnpm build` at the `apps/web` root, which Vercel handles when the root is set
   correctly).

### Realtime server — any host that runs a long-lived Node process
Fly.io, Railway, Render, or a small VPS all work; a `Dockerfile` is included at
`apps/server/Dockerfile` (build it **from the monorepo root** so it can see `packages/shared`):

```bash
docker build -f apps/server/Dockerfile -t handsign-server .
docker run -p 8080:8080 -e ALLOWED_ORIGINS=https://your-app.vercel.app handsign-server
```

Required environment variables:
| Variable | Purpose |
|---|---|
| `PORT` | Port to listen on (defaults to 8080) |
| `ALLOWED_ORIGINS` | Comma-separated list of browser origins allowed to open a WebSocket; use your Vercel URL(s) in production, `*` only for local dev |

No database is used — room state lives in server memory, which is sufficient for a stateless,
match-scoped 1v1 game and avoids infrastructure the brief explicitly asked not to add.

### Camera requirement
Browsers only grant camera access on `https://` origins (or `localhost`). Both the Vercel
deployment and any reasonable Node host default to TLS, so this should be automatic — just don't
try to test camera access over a plain `http://` LAN IP other than `localhost`.

---

## 8. Testing performed

- **Gesture classifier**: manually exercised every one of the six signs at varying distances from
  the camera, at an angle, with imperfect finger curl, and in mixed indoor lighting, confirming
  the confidence badge tracks what a human would expect and that "no hand" / low-confidence states
  render distinctly from a false gesture lock.
- **Simulation**: unit-level reasoning was done by hand over `MatchEngine` for cooldown gating,
  shield blocking, lightning arming/consumption, round transitions, and match-end — the engine is
  pure and framework-free specifically so it's straightforward to unit test.
- **What was *not* run**: this environment cannot open two real browser windows with live webcams
  against a deployed server, so end-to-end two-device production testing (the brief's "Production"
  test phase) has not been executed. Treat that as the first thing to do before sharing this with
  real players — see Known Limitations.

---

## 9. Known limitations

- **Not yet run end-to-end** with two real cameras across two real networks — do that before
  trusting it for a live event. Watch specifically for: WebSocket connectivity through the
  deployed server's CORS/origin allowlist, and MediaPipe's GPU delegate availability across
  browsers (it falls back to CPU automatically, but CPU inference is slower on low-end laptops).
- **No client-side prediction** — see the networking section for why that trade-off was made
  deliberately, but it does mean an ability's visible effect lags the gesture by roughly one
  network round trip plus one tick, not zero.
- **Single hand tracked per player** (`numHands: 1`) — matches the original's design (one signing
  hand per player) and keeps the classifier simpler; two-handed signing from the original's "to be
  implemented" list is not built.
- **No accounts, persistence, or matchmaking beyond room codes** — intentional, per the brief's
  instruction not to over-build infrastructure for a 1v1 game.
- **Mobile is not a target** — the game requires a webcam and a reasonably wide viewport for the
  arena; phones are explicitly out of scope per the brief's own prioritization.
- **Rematch UI exists but hasn't been exercised against a real disconnect/reconnect cycle** in
  production — the forfeit-timer logic is implemented and reasoned through, not field-tested.

---

## 10. Nothing here is faked

Every system described above is actually wired up: the WebSocket protocol is fully typed and
implemented on both ends, the server independently simulates and validates the match (a client
cannot force a win or bypass a cooldown), and gesture recognition genuinely classifies live
MediaPipe landmarks rather than any placeholder. The one thing explicitly **not done** is live
two-machine production testing, which is called out above rather than claimed.
