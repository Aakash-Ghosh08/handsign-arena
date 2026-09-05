"use client";

import type { ClientMessage, ServerMessage } from "@handsign/shared";

export type ConnectionStatus = "connecting" | "open" | "reconnecting" | "closed";

type Listener = (msg: ServerMessage) => void;
type StatusListener = (status: ConnectionStatus) => void;

const RECONNECT_DELAYS = [500, 1000, 2000, 4000, 8000];

export class GameSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<StatusListener>();
  private attempt = 0;
  private manuallyClosed = false;
  private queue: ClientMessage[] = [];
  private replayOnOpen: ClientMessage | null = null;

  constructor(url: string) {
    this.url = url;
    console.info("[socket] WebSocket URL", url);
  }

  /** Sets a message (e.g. create/join) to resend automatically if we ever reconnect. */
  setReplayOnOpen(msg: ClientMessage | null) {
    this.replayOnOpen = msg;
  }

  connect() {
    this.manuallyClosed = false;
    this.openSocket();
  }

  private openSocket() {
    this.emitStatus(this.attempt === 0 ? "connecting" : "reconnecting");
    console.info("[socket] Connecting", { attempt: this.attempt });
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0;
      this.emitStatus("open");
      console.info("[socket] open");
      if (this.replayOnOpen) this.send(this.replayOnOpen);
      for (const msg of this.queue) this.rawSend(msg);
      this.queue = [];
    };

    ws.onmessage = (ev) => {
      try {
        const msg: ServerMessage = JSON.parse(ev.data);
        for (const l of this.listeners) l(msg);
      } catch {
        // ignore malformed frames
      }
    };

    ws.onclose = () => {
      console.warn("[socket] close", { manuallyClosed: this.manuallyClosed });
      if (this.manuallyClosed) {
        this.emitStatus("closed");
        return;
      }
      const delay = RECONNECT_DELAYS[Math.min(this.attempt, RECONNECT_DELAYS.length - 1)];
      this.attempt += 1;
      this.emitStatus("reconnecting");
      setTimeout(() => this.openSocket(), delay);
    };

    ws.onerror = () => {
      console.error("[socket] error");
      ws.close();
    };
  }

  onMessage(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onStatus(fn: StatusListener) {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  private emitStatus(s: ConnectionStatus) {
    for (const l of this.statusListeners) l(s);
  }

  private rawSend(msg: ClientMessage) {
    if (msg.type === "create" || msg.type === "join") {
      console.info("[socket] Sending room message", msg);
    }
    this.ws?.send(JSON.stringify(msg));
  }

  send(msg: ClientMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.rawSend(msg);
    } else {
      this.queue.push(msg);
      if (this.queue.length > 20) this.queue.shift(); // don't let gesture spam build up unbounded across an outage
    }
  }

  close() {
    this.manuallyClosed = true;
    this.ws?.close();
  }
}

export function resolveServerUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_REALTIME_URL;
  if (explicit) {
    const safeUrl = new URL(explicit);
    safeUrl.username = "";
    safeUrl.password = "";
    safeUrl.search = "";
    safeUrl.hash = "";
    console.info("[socket] Using configured realtime URL", safeUrl.toString());
    return explicit;
  }
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const fallback = `${proto}//${window.location.hostname}:8080`;
    if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      console.warn("[socket] NEXT_PUBLIC_REALTIME_URL is missing; using development fallback", fallback);
    }
    return fallback;
  }
  return "ws://localhost:8080";
}
