"use client";

import type { GameState, PlayerSlot } from "@handsign/shared";

export function PointOverBanner({ state, mySlot }: { state: GameState; mySlot: PlayerSlot }) {
  const winner = state.players.p1.isDead ? "p2" : "p1";
  const won = winner === mySlot;
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
      <div className="text-center animate-rise-fade">
        <p className={`font-display text-4xl ${won ? "text-jade" : "text-danger"}`}>{won ? "Round won" : "Round lost"}</p>
        <p className="text-muted mt-2 text-sm">Next round starting…</p>
      </div>
    </div>
  );
}

export function VictoryOverlay({
  state,
  mySlot,
  onRematch,
  rematchRequested,
  opponentConnected,
}: {
  state: GameState;
  mySlot: PlayerSlot;
  onRematch: () => void;
  rematchRequested: boolean;
  opponentConnected: boolean;
}) {
  const won = state.winner === mySlot;
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/75">
      <div className="text-center max-w-sm px-6">
        <p className={`font-display text-6xl ${won ? "text-jade" : "text-danger"}`}>{won ? "Victory" : "Defeat"}</p>
        <p className="text-muted mt-3">
          {state.roundWins.p1} — {state.roundWins.p2}
        </p>

        {!opponentConnected ? (
          <p className="text-muted mt-6 text-sm">Your opponent disconnected. Rematch isn't available for this match.</p>
        ) : (
          <div className="mt-8">
            <button
              onClick={onRematch}
              disabled={rematchRequested}
              className="focus-ring bg-chakra text-ink font-semibold px-6 py-3 hover:bg-chakra-bright transition-colors disabled:opacity-50"
            >
              {rematchRequested ? "Waiting for opponent…" : "Request rematch"}
            </button>
          </div>
        )}

        <div className="mt-4">
          <a href="/" className="focus-ring text-sm text-muted underline hover:text-paper">
            Back to home
          </a>
        </div>
      </div>
    </div>
  );
}
