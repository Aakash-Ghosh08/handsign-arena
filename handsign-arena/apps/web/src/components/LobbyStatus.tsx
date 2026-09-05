"use client";

import { useState } from "react";
import type { GameState, PlayerSlot } from "@handsign/shared";

function CheckRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <li className={`flex items-center gap-2 text-sm ${ok ? "text-jade" : "text-muted"}`}>
      <span>{ok ? "✓" : "…"}</span>
      <span>{label}</span>
    </li>
  );
}

export function LobbyStatus({
  roomCode,
  mySlot,
  state,
  selfCameraReady,
  selfHandDetected,
}: {
  roomCode: string;
  mySlot: PlayerSlot;
  state: GameState | null;
  selfCameraReady: boolean;
  selfHandDetected: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const oppSlot: PlayerSlot = mySlot === "p1" ? "p2" : "p1";
  const opponent = state?.players[oppSlot];
  const opponentConnected = opponent?.connected ?? false;

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/room/${roomCode}` : "";

  return (
    <div className="border border-ink-line bg-ink-panel/60 p-5 max-w-sm mx-auto">
      <p className="text-xs uppercase tracking-wide text-muted mb-1">Room code</p>
      <div className="flex items-center gap-3 mb-4">
        <span className="font-display text-3xl tracking-[0.2em] text-paper">{roomCode}</span>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="focus-ring text-xs border border-ink-line px-2 py-1 text-muted hover:text-paper transition-colors"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted mb-2">You</p>
          <ul className="space-y-1">
            <CheckRow label="Camera" ok={selfCameraReady} />
            <CheckRow label="Hand detected" ok={selfHandDetected} />
          </ul>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted mb-2">Opponent</p>
          {!opponentConnected ? (
            <p className="text-sm text-muted">Waiting for someone to join…</p>
          ) : (
            <ul className="space-y-1">
              <CheckRow label="Camera" ok={opponent?.cameraReady ?? false} />
              <CheckRow label="Hand detected" ok={opponent?.handDetected ?? false} />
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export function CountdownOverlay({ ms }: { ms: number }) {
  const seconds = Math.ceil(ms / 1000);
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
      <span className="font-display text-8xl text-paper drop-shadow-[0_0_24px_rgba(127,230,255,0.6)]">{seconds || "Go"}</span>
    </div>
  );
}
