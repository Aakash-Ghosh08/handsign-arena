// ============================================================================
// Shared types — the single vocabulary both the server and the browser client
// speak. Keeping this in one package prevents the classic "client and server
// silently drift apart" bug class.
// ============================================================================

/** The gestures the vision pipeline can recognize, before temporal smoothing. */
export type RawGesture =
  | "fist"
  | "open_palm"
  | "peace"
  | "point"
  | "rock" // thumb + index + pinky extended, "sage sign" — heals
  | "three"
  | "none";

/** The stable, debounced gesture the game actually reacts to. */
export type StableGesture = RawGesture;

/** Abilities a player can trigger. */
export type AbilityId = "fireball" | "lightning" | "shield" | "heal" | "dash" | "move";

export interface Vec2 {
  x: number;
  y: number;
}

export type PlayerSlot = "p1" | "p2";

/** One live projectile/effect in the arena. */
export interface Projectile {
  id: string;
  owner: PlayerSlot;
  kind: "fireball" | "lightning";
  pos: Vec2;
  dir: Vec2;
  spawnedAt: number;
}

export interface PlayerState {
  slot: PlayerSlot;
  name: string;
  pos: Vec2;
  health: number;
  maxHealth: number;
  shieldActive: boolean;
  isDead: boolean;
  /** ms remaining, purely for UI — server is authoritative on whether an action is allowed */
  cooldowns: {
    attack: number;
    dash: number;
    heal: number;
  };
  /** whether lightning is "armed" via the fist->open combo, shown so the player knows they loaded it */
  lightningArmed: boolean;
  lastGesture: RawGesture;
  connected: boolean;
  cameraReady: boolean;
  handDetected: boolean;
}

export type MatchPhase =
  | "waiting_for_players"
  | "camera_setup"
  | "countdown"
  | "in_progress"
  | "point_over"
  | "match_over";

export interface GameState {
  phase: MatchPhase;
  tick: number;
  serverTime: number;
  players: Record<PlayerSlot, PlayerState>;
  projectiles: Projectile[];
  arena: { width: number; height: number };
  round: number;
  roundWins: Record<PlayerSlot, number>;
  winner: PlayerSlot | null;
  countdownMs?: number;
}

// ---- Client -> Server messages ----------------------------------------------

export type ClientMessage =
  | { type: "join"; roomCode: string; name: string }
  | { type: "create"; name: string }
  | { type: "camera_status"; ready: boolean; handDetected: boolean }
  | { type: "ready" }
  | { type: "gesture"; gesture: RawGesture; dir: Vec2; confidence: number; t: number }
  | { type: "rematch_request" }
  | { type: "ping"; t: number };

// ---- Server -> Client messages ----------------------------------------------

export type ServerMessage =
  | { type: "room_created"; roomCode: string; slot: PlayerSlot }
  | { type: "room_joined"; roomCode: string; slot: PlayerSlot }
  | { type: "room_error"; reason: "not_found" | "full" | "invalid_code" }
  | { type: "opponent_joined"; name: string }
  | { type: "opponent_left" }
  | { type: "opponent_camera_status"; ready: boolean; handDetected: boolean }
  | { type: "state"; state: GameState }
  | { type: "cast_feedback"; slot: PlayerSlot; ability: AbilityId; accepted: boolean }
  | { type: "pong"; t: number };

export const ROOM_CODE_LENGTH = 5;
