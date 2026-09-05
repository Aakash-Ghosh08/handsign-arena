export const ARENA = { width: 1280, height: 720 };

export const TICK_RATE = 30; // authoritative simulation ticks per second
export const TICK_MS = 1000 / TICK_RATE;

export const PLAYER_RADIUS = 26;
export const MAX_HEALTH = 100;

// Movement is "channeled": as long as the player holds a point gesture, they
// drift in that direction. This reads far better on camera than the
// original's raw per-frame teleport-by-speed, and is resistant to a single
// noisy frame flipping direction.
export const MOVE_SPEED = 240; // px/second

export const DASH_DISTANCE = 170;
export const DASH_COOLDOWN_MS = 2200;

export const ATTACK_COOLDOWN_MS = 650;
export const LIGHTNING_COOLDOWN_MS = 950;

export const HEAL_COOLDOWN_MS = 3200;
export const HEAL_AMOUNT = 16;

export const FIREBALL_DAMAGE = 12;
export const FIREBALL_SPEED = 520; // px/s
export const FIREBALL_RADIUS = 13;

export const LIGHTNING_DAMAGE = 32;
export const LIGHTNING_SPEED = 780; // px/s
export const LIGHTNING_RADIUS = 19;

export const ROUND_WINS_TO_TAKE_MATCH = 2; // best of 3

export const SPAWN_MARGIN = 140;

// --- Gesture temporal smoothing (client-side vision pipeline) --------------
// These are intentionally *not* used by the authoritative server — the
// server only trusts discrete, already-debounced "gesture" events with a
// confidence score, and re-validates cooldowns itself.
export const GESTURE_WINDOW_SIZE = 8; // frames of history considered
export const GESTURE_CONFIRM_RATIO = 0.62; // fraction of window that must agree
export const GESTURE_MIN_CONFIDENCE = 0.55; // per-frame classifier confidence floor
export const GESTURE_RETRIGGER_COOLDOWN_MS = 220; // guards against one hold firing twice
