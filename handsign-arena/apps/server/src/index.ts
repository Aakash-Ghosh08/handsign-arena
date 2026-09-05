import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import type { ClientMessage, PlayerSlot } from "@handsign/shared";
import { RoomManager, Room } from "./rooms";

const PORT = Number(process.env.PORT || 8080);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map((s) => s.trim())
  .map((s) => {
    if (s === "*") return s;
    try {
      return new URL(s).origin;
    } catch {
      return s;
    }
  })
  .filter(Boolean);

const manager = new RoomManager();

const server = http.createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, rooms: manager.size }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ noServer: true });

function originAllowed(origin: string | undefined): boolean {
  if (ALLOWED_ORIGINS.includes("*")) return true;
  if (!origin) return false;
  try {
    return ALLOWED_ORIGINS.includes(new URL(origin).origin);
  } catch {
    return false;
  }
}

server.on("upgrade", (req, socket, head) => {
  const allowed = originAllowed(req.headers.origin);
  console.info("[ws] Upgrade request", {
    url: req.url,
    origin: req.headers.origin,
    host: req.headers.host,
    originAllowed: allowed,
  });
  if (!allowed) {
    console.warn("[ws] Rejected upgrade", { origin: req.headers.origin });
    socket.destroy();
    return;
  }
  try {
    console.info("[ws] Calling wss.handleUpgrade");
    wss.handleUpgrade(req, socket, head, (ws) => {
      console.info("[ws] wss.handleUpgrade completed");
      wss.emit("connection", ws, req);
    });
  } catch (error) {
    console.error("[ws] Upgrade failed", error);
    socket.destroy();
  }
});

interface Session {
  room: Room | null;
  slot: PlayerSlot | null;
}

wss.on("connection", (ws: WebSocket) => {
  console.info("[ws] WebSocket connection/open");
  const session: Session = { room: null, slot: null };

  ws.on("open", () => console.info("[ws] WebSocket open"));

  ws.on("message", (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      console.warn("[ws] Ignored invalid JSON message");
      return;
    }
    console.info("[ws] Received client message", { type: msg.type });

    if (msg.type === "create") {
      const room = manager.createRoom();
      const slot = room.addPlayer(ws, msg.name || "Player");
      session.room = room;
      session.slot = slot;
      console.info("[room] Created room", { roomCode: room.code, slot, name: msg.name || "Player" });
      ws.send(JSON.stringify({ type: "room_created", roomCode: room.code, slot }));
      console.info("[room] Sent room_created", { roomCode: room.code, slot });
      return;
    }

    if (msg.type === "join") {
      const code = (msg.roomCode || "").toUpperCase().trim();
      const room = manager.getRoom(code);
      if (!room) {
        console.warn("[room] Rejected join: room not found", { roomCode: code });
        ws.send(JSON.stringify({ type: "room_error", reason: "not_found" }));
        return;
      }
      const slot = room.addPlayer(ws, msg.name || "Player");
      if (!slot) {
        console.warn("[room] Rejected join: room full", { roomCode: code });
        ws.send(JSON.stringify({ type: "room_error", reason: "full" }));
        return;
      }
      session.room = room;
      session.slot = slot;
      console.info("[room] Accepted join", { roomCode: room.code, slot, name: msg.name || "Player" });
      ws.send(JSON.stringify({ type: "room_joined", roomCode: room.code, slot }));
      console.info("[room] Sent room_joined", { roomCode: room.code, slot });
      return;
    }

    if (session.room && session.slot) {
      session.room.handleMessage(session.slot, msg);
    }
  });

  ws.on("close", () => {
    console.info("[ws] WebSocket close");
    if (session.room && session.slot) {
      session.room.removePlayer(session.slot);
    }
  });

  ws.on("error", () => {
    console.error("[ws] WebSocket error");
    // 'close' will still fire; nothing extra to do here.
  });
});

server.listen(PORT, () => {
  console.log(`handsign-arena realtime server listening on :${PORT}`, {
    allowedOrigins: ALLOWED_ORIGINS,
  });
});
