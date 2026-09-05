import {
  ARENA,
  ATTACK_COOLDOWN_MS,
  DASH_COOLDOWN_MS,
  DASH_DISTANCE,
  FIREBALL_DAMAGE,
  FIREBALL_RADIUS,
  FIREBALL_SPEED,
  HEAL_AMOUNT,
  HEAL_COOLDOWN_MS,
  LIGHTNING_COOLDOWN_MS,
  LIGHTNING_DAMAGE,
  LIGHTNING_RADIUS,
  LIGHTNING_SPEED,
  MAX_HEALTH,
  MOVE_SPEED,
  PLAYER_RADIUS,
  ROUND_WINS_TO_TAKE_MATCH,
  SPAWN_MARGIN,
} from "./constants";
import type { GameState, PlayerSlot, PlayerState, Projectile, Vec2 } from "./types";

const OTHER: Record<PlayerSlot, PlayerSlot> = { p1: "p2", p2: "p1" };

function normalize(v: Vec2): Vec2 {
  const len = Math.hypot(v.x, v.y);
  if (len < 1e-6) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function makePlayer(slot: PlayerSlot, name: string, pos: Vec2): PlayerState {
  return {
    slot,
    name,
    pos,
    health: MAX_HEALTH,
    maxHealth: MAX_HEALTH,
    shieldActive: false,
    isDead: false,
    cooldowns: { attack: 0, dash: 0, heal: 0 },
    lightningArmed: false,
    lastGesture: "none",
    connected: false,
    cameraReady: false,
    handDetected: false,
  };
}

interface ContinuousInput {
  moving: boolean;
  moveDir: Vec2;
  shielding: boolean;
}

/** Internal (not networked) per-player bookkeeping. */
interface InternalPlayer {
  readyAt: { attack: number; dash: number; heal: number };
  lightningArmedUntil: number;
  recentGestureEnters: string[]; // small ring buffer of confirmed-gesture entries, for the fist->open combo
  input: ContinuousInput;
}

let idCounter = 0;
const nextId = () => `proj_${++idCounter}_${Date.now().toString(36)}`;

export class MatchEngine {
  private state: GameState;
  private internal: Record<PlayerSlot, InternalPlayer>;

  constructor(p1Name: string, p2Name: string) {
    this.state = {
      phase: "waiting_for_players",
      tick: 0,
      serverTime: Date.now(),
      players: {
        p1: makePlayer("p1", p1Name, { x: SPAWN_MARGIN, y: ARENA.height / 2 }),
        p2: makePlayer("p2", p2Name, { x: ARENA.width - SPAWN_MARGIN, y: ARENA.height / 2 }),
      },
      projectiles: [],
      arena: ARENA,
      round: 1,
      roundWins: { p1: 0, p2: 0 },
      winner: null,
    };
    this.internal = {
      p1: this.freshInternal(),
      p2: this.freshInternal(),
    };
  }

  private freshInternal(): InternalPlayer {
    return {
      readyAt: { attack: 0, dash: 0, heal: 0 },
      lightningArmedUntil: 0,
      recentGestureEnters: [],
      input: { moving: false, moveDir: { x: 0, y: 0 }, shielding: false },
    };
  }

  getState(): GameState {
    return this.state;
  }

  setPhase(phase: GameState["phase"]) {
    this.state.phase = phase;
  }

  setConnected(slot: PlayerSlot, connected: boolean) {
    this.state.players[slot].connected = connected;
  }

  setCameraStatus(slot: PlayerSlot, ready: boolean, handDetected: boolean) {
    this.state.players[slot].cameraReady = ready;
    this.state.players[slot].handDetected = handDetected;
  }

  /** Called whenever the client reports its currently-held stable gesture. */
  onGestureUpdate(slot: PlayerSlot, gesture: string, dir: Vec2, now: number) {
    const player = this.state.players[slot];
    const internal = this.internal[slot];
    const prev = player.lastGesture;
    player.lastGesture = gesture as PlayerState["lastGesture"];

    // continuous states
    internal.input.shielding = gesture === "fist";
    internal.input.moving = gesture === "point";
    if (gesture === "point") internal.input.moveDir = normalize(dir);

    // record "enter" events for combo detection (fist -> open_palm arms lightning)
    if (gesture !== prev) {
      internal.recentGestureEnters.push(gesture);
      if (internal.recentGestureEnters.length > 6) internal.recentGestureEnters.shift();

      const enters = internal.recentGestureEnters;
      for (let i = 0; i < enters.length - 1; i++) {
        if (enters[i] === "fist" && enters[i + 1] === "open_palm") {
          internal.lightningArmedUntil = now + 4000;
        }
      }
    }

    player.lightningArmed = now < internal.lightningArmedUntil;

    // discrete, edge-triggered abilities
    if (gesture !== prev) {
      if (gesture === "peace") this.tryAttack(slot, dir, now);
      else if (gesture === "rock") this.tryHeal(slot, now);
      else if (gesture === "three") this.tryDash(slot, dir, now);
    }
  }

  private tryAttack(slot: PlayerSlot, dir: Vec2, now: number): boolean {
    const internal = this.internal[slot];
    const player = this.state.players[slot];
    if (player.isDead || this.state.phase !== "in_progress") return false;
    if (now < internal.readyAt.attack) return false;

    const useLightning = now < internal.lightningArmedUntil;
    const d = normalize(dir.x === 0 && dir.y === 0 ? { x: slot === "p1" ? 1 : -1, y: 0 } : dir);

    const projectile: Projectile = {
      id: nextId(),
      owner: slot,
      kind: useLightning ? "lightning" : "fireball",
      pos: { ...player.pos },
      dir: d,
      spawnedAt: now,
    };
    this.state.projectiles.push(projectile);

    internal.readyAt.attack = now + (useLightning ? LIGHTNING_COOLDOWN_MS : ATTACK_COOLDOWN_MS);
    if (useLightning) {
      internal.lightningArmedUntil = 0;
      player.lightningArmed = false;
    }
    return true;
  }

  private tryHeal(slot: PlayerSlot, now: number): boolean {
    const internal = this.internal[slot];
    const player = this.state.players[slot];
    if (player.isDead || this.state.phase !== "in_progress") return false;
    if (now < internal.readyAt.heal) return false;
    player.health = clamp(player.health + HEAL_AMOUNT, 0, player.maxHealth);
    internal.readyAt.heal = now + HEAL_COOLDOWN_MS;
    return true;
  }

  private tryDash(slot: PlayerSlot, dir: Vec2, now: number): boolean {
    const internal = this.internal[slot];
    const player = this.state.players[slot];
    if (player.isDead || this.state.phase !== "in_progress") return false;
    if (now < internal.readyAt.dash) return false;
    const d = normalize(dir);
    if (d.x === 0 && d.y === 0) return false;
    player.pos.x = clamp(player.pos.x + d.x * DASH_DISTANCE, PLAYER_RADIUS, ARENA.width - PLAYER_RADIUS);
    player.pos.y = clamp(player.pos.y + d.y * DASH_DISTANCE, PLAYER_RADIUS, ARENA.height - PLAYER_RADIUS);
    internal.readyAt.dash = now + DASH_COOLDOWN_MS;
    return true;
  }

  /** Advance the simulation by dtMs. Returns true if a round just ended. */
  tick(dtMs: number, now: number): { roundEnded: boolean } {
    this.state.tick += 1;
    this.state.serverTime = now;
    let roundEnded = false;

    if (this.state.phase !== "in_progress") {
      this.refreshCooldownDisplay(now);
      return { roundEnded: false };
    }

    const dt = dtMs / 1000;

    for (const slot of ["p1", "p2"] as PlayerSlot[]) {
      const player = this.state.players[slot];
      const internal = this.internal[slot];
      player.shieldActive = internal.input.shielding && !player.isDead;
      if (internal.input.moving && !player.isDead) {
        player.pos.x = clamp(player.pos.x + internal.input.moveDir.x * MOVE_SPEED * dt, PLAYER_RADIUS, ARENA.width - PLAYER_RADIUS);
        player.pos.y = clamp(player.pos.y + internal.input.moveDir.y * MOVE_SPEED * dt, PLAYER_RADIUS, ARENA.height - PLAYER_RADIUS);
      }
      player.lightningArmed = now < internal.lightningArmedUntil;
    }

    const surviving: Projectile[] = [];
    for (const proj of this.state.projectiles) {
      const speed = proj.kind === "fireball" ? FIREBALL_SPEED : LIGHTNING_SPEED;
      proj.pos.x += proj.dir.x * speed * dt;
      proj.pos.y += proj.dir.y * speed * dt;

      if (proj.pos.x < -40 || proj.pos.x > ARENA.width + 40 || proj.pos.y < -40 || proj.pos.y > ARENA.height + 40) {
        continue; // expired off-arena
      }

      const target = this.state.players[OTHER[proj.owner]];
      const radius = proj.kind === "fireball" ? FIREBALL_RADIUS : LIGHTNING_RADIUS;
      const dist = Math.hypot(target.pos.x - proj.pos.x, target.pos.y - proj.pos.y);
      if (!target.isDead && dist < radius + PLAYER_RADIUS) {
        if (!target.shieldActive) {
          const dmg = proj.kind === "fireball" ? FIREBALL_DAMAGE : LIGHTNING_DAMAGE;
          target.health = clamp(target.health - dmg, 0, target.maxHealth);
          if (target.health === 0) target.isDead = true;
        }
        continue; // consumed on impact (blocked or not)
      }
      surviving.push(proj);
    }
    this.state.projectiles = surviving;

    this.refreshCooldownDisplay(now);

    if (this.state.players.p1.isDead || this.state.players.p2.isDead) {
      roundEnded = true;
      const winner: PlayerSlot = this.state.players.p1.isDead ? "p2" : "p1";
      this.state.roundWins[winner] += 1;
      this.state.phase = "point_over";
      if (this.state.roundWins[winner] >= ROUND_WINS_TO_TAKE_MATCH) {
        this.state.winner = winner;
        this.state.phase = "match_over";
      }
    }

    return { roundEnded };
  }

  private refreshCooldownDisplay(now: number) {
    for (const slot of ["p1", "p2"] as PlayerSlot[]) {
      const internal = this.internal[slot];
      const player = this.state.players[slot];
      player.cooldowns = {
        attack: Math.max(0, internal.readyAt.attack - now),
        dash: Math.max(0, internal.readyAt.dash - now),
        heal: Math.max(0, internal.readyAt.heal - now),
      };
    }
  }

  /** Reset positions/health/projectiles for the next round, keep score. */
  startNextRound() {
    this.state.round += 1;
    this.state.projectiles = [];
    this.state.winner = null;
    for (const slot of ["p1", "p2"] as PlayerSlot[]) {
      const player = this.state.players[slot];
      player.health = player.maxHealth;
      player.isDead = false;
      player.shieldActive = false;
      player.lightningArmed = false;
      player.pos = slot === "p1" ? { x: SPAWN_MARGIN, y: ARENA.height / 2 } : { x: ARENA.width - SPAWN_MARGIN, y: ARENA.height / 2 };
      this.internal[slot] = this.freshInternal();
    }
    this.state.phase = "countdown";
  }

  /** Full reset for a rematch (score included). */
  resetMatch() {
    this.state.round = 1;
    this.state.roundWins = { p1: 0, p2: 0 };
    this.startNextRound();
  }
}
