"use client";

import type { GameState, PlayerSlot } from "@handsign/shared";
import { ROUND_WINS_TO_TAKE_MATCH } from "@handsign/shared";
import { GestureBadge } from "./GestureBadge";
import type { GestureName } from "@/lib/gesture/classifier";

function CooldownPip({ label, ms }: { label: string; ms: number }) {
  const ready = ms <= 0;
  return (
    <div className={`w-9 h-9 border flex items-center justify-center text-[11px] font-semibold ${ready ? "border-chakra text-chakra-bright" : "border-ink-line text-muted"}`}>
      {ready ? label : Math.ceil(ms / 100) / 10}
    </div>
  );
}

function RoundPips({ wins }: { wins: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: ROUND_WINS_TO_TAKE_MATCH }).map((_, i) => (
        <span key={i} className={`h-2 w-2 rounded-full ${i < wins ? "bg-jade" : "bg-ink-line"}`} />
      ))}
    </div>
  );
}

function PlayerCard({ slot, state, align }: { slot: PlayerSlot; state: GameState; align: "left" | "right" }) {
  const p = state.players[slot];
  const pct = Math.max(0, p.health / p.maxHealth);
  const barColor = pct > 0.4 ? "bg-jade" : pct > 0.15 ? "bg-[#F4C24B]" : "bg-danger";

  return (
    <div className={`flex flex-col ${align === "right" ? "items-end text-right" : "items-start"} gap-1 w-52`}>
      <div className="flex items-center gap-2">
        {align === "left" && <span className="font-semibold text-paper text-sm">{p.name}</span>}
        <RoundPips wins={state.roundWins[slot]} />
        {align === "right" && <span className="font-semibold text-paper text-sm">{p.name}</span>}
      </div>
      <div className="h-3 w-full bg-ink-panel border border-ink-line overflow-hidden">
        <div className={`h-full ${barColor} transition-[width] duration-150`} style={{ width: `${pct * 100}%` }} />
      </div>
      <div className={`flex gap-1.5 mt-1 ${align === "right" ? "flex-row-reverse" : ""}`}>
        <CooldownPip label="🔥" ms={p.cooldowns.attack} />
        <CooldownPip label="⚡" ms={p.cooldowns.dash} />
        <CooldownPip label="✨" ms={p.cooldowns.heal} />
        {p.shieldActive && <div className="w-9 h-9 border border-chakra-bright flex items-center justify-center text-[11px] text-chakra-bright">🛡</div>}
        {p.lightningArmed && <div className="w-9 h-9 border border-dashed border-chakra-bright flex items-center justify-center text-[11px] text-chakra-bright">⚡</div>}
      </div>
    </div>
  );
}

export function MatchHud({
  state,
  mySlot,
  myGesture,
  myConfidence,
  myHandPresent,
}: {
  state: GameState;
  mySlot: PlayerSlot;
  myGesture: GestureName;
  myConfidence: number;
  myHandPresent: boolean;
}) {
  const oppSlot: PlayerSlot = mySlot === "p1" ? "p2" : "p1";

  return (
    <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4 pointer-events-none">
      <PlayerCard slot={mySlot} state={state} align="left" />

      <div className="flex flex-col items-center gap-2 pointer-events-auto">
        <span className="text-xs text-muted uppercase tracking-wide">Round {state.round}</span>
        <GestureBadge gesture={myGesture} confidence={myConfidence} handPresent={myHandPresent} />
        <div className="text-[11px] text-muted">
          Opponent: <GestureLabel gesture={state.players[oppSlot].lastGesture as GestureName} />
        </div>
      </div>

      <PlayerCard slot={oppSlot} state={state} align="right" />
    </div>
  );
}

function GestureLabel({ gesture }: { gesture: GestureName }) {
  const map: Record<string, string> = {
    fist: "Guarding ✊",
    open_palm: "Priming ✋",
    peace: "Casting ✌️",
    point: "Advancing ☝️",
    rock: "Mending 🤟",
    three: "Dashing 🤟",
    none: "—",
  };
  return <span>{map[gesture] ?? "—"}</span>;
}
