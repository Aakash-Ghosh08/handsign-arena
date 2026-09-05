import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import type { ClientMessage, PlayerSlot } from "@handsign/shared";
import { RoomManager, Room } from "./rooms";

const PORT = Number(process.env.PORT || 8080);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map((s) => s.trim())
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
  return ALLOWED_ORIGINS.includes(origin);
}

server.on("upgrade", (req, socket, head) => {
  if (!originAllowed(req.headers.origin)) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

interface Session {
  room: Room | null;
  slot: PlayerSlot | null;
}

wss.on("connection", (ws: WebSocket) => {
  const session: Session = { room: null, slot: null };

  ws.on("message", (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === "create") {
      const room = manager.createRoom();
      const slot = room.addPlayer(ws, msg.name || "Player");
      session.room = room;
      session.slot = slot;
      ws.send(JSON.stringify({ type: "room_created", roomCode: room.code, slot }));
      return;
    }

    if (msg.type === "join") {
      const code = (msg.roomCode || "").toUpperCase().trim();
      const room = manager.getRoom(code);
      if (!room) {
        ws.send(JSON.stringify({ type: "room_error", reason: "not_found" }));
        return;
      }
      const slot = room.addPlayer(ws, msg.name || "Player");
      if (!slot) {
        ws.send(JSON.stringify({ type: "room_error", reason: "full" }));
        return;
      }
      session.room = room;
      session.slot = slot;
      ws.send(JSON.stringify({ type: "room_joined", roomCode: room.code, slot }));
      return;
    }

    if (session.room && session.slot) {
      session.room.handleMessage(session.slot, msg);
    }
  });

  ws.on("close", () => {
    if (session.room && session.slot) {
      session.room.removePlayer(session.slot);
    }
  });

  ws.on("error", () => {
    // 'close' will still fire; nothing extra to do here.
  });
});

server.listen(PORT, () => {
  console.log(`handsign-arena realtime server listening on :${PORT}`);
});
