import { WebSocket } from "ws";
import { MatchEngine, ROOM_CODE_LENGTH, TICK_MS, type ClientMessage, type PlayerSlot, type ServerMessage } from "@handsign/shared";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/I/1 — avoids "is that an O or a zero" support tickets

function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

interface Connection {
  ws: WebSocket;
  slot: PlayerSlot;
}

const COUNTDOWN_MS = 3000;
const DISCONNECT_FORFEIT_MS = 25000;

export class Room {
  code: string;
  engine: MatchEngine;
  connections: Partial<Record<PlayerSlot, Connection>> = {};
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private lastTick = Date.now();
  private countdownDeadline: number | null = null;
  private forfeitTimers: Partial<Record<PlayerSlot, ReturnType<typeof setTimeout>>> = {};
  private onEmpty: () => void;
  private lastGestureLog = 0;

  constructor(code: string, onEmpty: () => void) {
    this.code = code;
    this.engine = new MatchEngine("Player 1", "Player 2");
    this.onEmpty = onEmpty;
  }

  private send(slot: PlayerSlot, msg: ServerMessage) {
    const conn = this.connections[slot];
    if (conn && conn.ws.readyState === WebSocket.OPEN) conn.ws.send(JSON.stringify(msg));
  }

  private broadcast(msg: ServerMessage) {
    this.send("p1", msg);
    this.send("p2", msg);
  }

  addPlayer(ws: WebSocket, name: string): PlayerSlot | null {
    const slot: PlayerSlot | null = !this.connections.p1 ? "p1" : !this.connections.p2 ? "p2" : null;
    if (!slot) return null;

    if (this.forfeitTimers[slot]) {
      clearTimeout(this.forfeitTimers[slot]!);
      delete this.forfeitTimers[slot];
    }

    this.connections[slot] = { ws, slot };
    this.engine.setConnected(slot, true);
    if (name) this.engine.getState().players[slot].name = name;

    const otherSlot: PlayerSlot = slot === "p1" ? "p2" : "p1";
    if (this.connections[otherSlot]) {
      this.send(otherSlot, { type: "opponent_joined", name: this.engine.getState().players[slot].name });
    }

    if (this.connections.p1 && this.connections.p2 && this.engine.getState().phase === "waiting_for_players") {
      this.engine.setPhase("camera_setup");
    }

    this.pushState();
    this.ensureLoop();
    return slot;
  }

  removePlayer(slot: PlayerSlot) {
    delete this.connections[slot];
    this.engine.setConnected(slot, false);
    const otherSlot: PlayerSlot = slot === "p1" ? "p2" : "p1";
    this.send(otherSlot, { type: "opponent_left" });

    // Grace period so a refresh/blip doesn't instantly end the match.
    this.forfeitTimers[slot] = setTimeout(() => {
      const state = this.engine.getState();
      if (!this.connections[slot] && state.phase !== "match_over") {
        state.winner = otherSlot;
        state.phase = "match_over";
        this.pushState();
      }
    }, DISCONNECT_FORFEIT_MS);

    if (!this.connections.p1 && !this.connections.p2) {
      this.stopLoop();
      this.onEmpty();
    }
  }

  handleMessage(slot: PlayerSlot, msg: ClientMessage) {
    const state = this.engine.getState();
    switch (msg.type) {
      case "camera_status": {
        this.engine.setCameraStatus(slot, msg.ready, msg.handDetected);
        const otherSlot: PlayerSlot = slot === "p1" ? "p2" : "p1";
        this.send(otherSlot, { type: "opponent_camera_status", ready: msg.ready, handDetected: msg.handDetected });
        this.maybeStartCountdown();
        break;
      }
      case "gesture": {
        if (state.phase === "in_progress") {
          if (Date.now() - this.lastGestureLog > 500) {
            this.lastGestureLog = Date.now();
            console.info("[game] received gesture", { roomCode: this.code, slot, gesture: msg.gesture, dir: msg.dir });
          }
          const before = { ...state.players[slot].pos, lastGesture: state.players[slot].lastGesture };
          this.engine.onGestureUpdate(slot, msg.gesture, msg.dir, Date.now());
          const after = state.players[slot];
          if (after.lastGesture !== before.lastGesture || after.pos.x !== before.x || after.pos.y !== before.y) {
            console.info("[game] authoritative player state changed", {
              roomCode: this.code,
              slot,
              lastGesture: after.lastGesture,
              pos: after.pos,
              health: after.health,
            });
          }
        }
        break;
      }
      case "rematch_request": {
        (state as any)[`_rematch_${slot}`] = true;
        if ((state as any)._rematch_p1 && (state as any)._rematch_p2) {
          (state as any)._rematch_p1 = false;
          (state as any)._rematch_p2 = false;
          this.engine.resetMatch();
          this.countdownDeadline = Date.now() + COUNTDOWN_MS;
        }
        break;
      }
      case "ping": {
        this.send(slot, { type: "pong", t: msg.t });
        break;
      }
    }
  }

  private maybeStartCountdown() {
    const state = this.engine.getState();
    if (state.phase !== "camera_setup") return;
    const p1 = state.players.p1;
    const p2 = state.players.p2;
    if (p1.connected && p2.connected && p1.cameraReady && p2.cameraReady && p1.handDetected && p2.handDetected) {
      this.engine.setPhase("countdown");
      this.countdownDeadline = Date.now() + COUNTDOWN_MS;
    }
  }

  private ensureLoop() {
    if (this.tickHandle) return;
    this.lastTick = Date.now();
    this.tickHandle = setInterval(() => this.tickOnce(), TICK_MS);
  }

  private stopLoop() {
    if (this.tickHandle) clearInterval(this.tickHandle);
    this.tickHandle = null;
  }

  private tickOnce() {
    const now = Date.now();
    const dt = now - this.lastTick;
    this.lastTick = now;
    const state = this.engine.getState();

    if (state.phase === "countdown" && this.countdownDeadline) {
      state.countdownMs = Math.max(0, this.countdownDeadline - now);
      if (now >= this.countdownDeadline) {
        this.engine.setPhase("in_progress");
        this.countdownDeadline = null;
      }
    } else if (state.phase === "point_over") {
      // brief pause between rounds, then auto-advance unless the match ended
      if (!(this as any)._pointOverAt) (this as any)._pointOverAt = now;
      if (now - (this as any)._pointOverAt > 2200) {
        (this as any)._pointOverAt = null;
        this.engine.startNextRound();
        this.countdownDeadline = Date.now() + COUNTDOWN_MS;
      }
    } else {
      this.engine.tick(dt, now);
    }

    this.pushState();
  }

  private pushState() {
    if (this.engine.getState().phase === "in_progress" && this.engine.getState().tick % 30 === 0) {
      console.info("[game] broadcasting state", { roomCode: this.code, tick: this.engine.getState().tick });
    }
    this.broadcast({ type: "state", state: this.engine.getState() });
  }
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  createRoom(): Room {
    let code = generateRoomCode();
    while (this.rooms.has(code)) code = generateRoomCode();
    const room = new Room(code, () => this.rooms.delete(code));
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  get size() {
    return this.rooms.size;
  }
}
