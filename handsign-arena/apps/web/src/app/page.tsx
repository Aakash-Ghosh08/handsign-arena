"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ABILITIES: { sign: string; name: string; desc: string; color: string }[] = [
  { sign: "✊", name: "Guard", desc: "Fist — raise a shield that blocks the next hit", color: "text-chakra-bright" },
  { sign: "✋", name: "Prime", desc: "Open palm — arm your next cast into lightning", color: "text-chakra-bright" },
  { sign: "✌️", name: "Cast", desc: "Peace sign, aimed — throw fire, or lightning if primed", color: "text-ember-bright" },
  { sign: "☝️", name: "Advance", desc: "Point and hold to move that direction", color: "text-paper" },
  { sign: "🤟", name: "Mend", desc: "Thumb, index, pinky out — restore health", color: "text-jade" },
  { sign: "🤟✌️", name: "Dash", desc: "Three fingers, aimed — blink a short distance", color: "text-paper" },
];

export default function LandingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [mode, setMode] = useState<"create" | "join">("create");
  const [error, setError] = useState<string | null>(null);

  function go() {
    const trimmedName = name.trim() || "Challenger";
    if (mode === "join") {
      const code = joinCode.trim().toUpperCase();
      if (code.length < 4) {
        setError("Enter the 5-character room code your opponent shared.");
        return;
      }
      router.push(`/room/${code}?name=${encodeURIComponent(trimmedName)}`);
    } else {
      router.push(`/room/new?name=${encodeURIComponent(trimmedName)}`);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-14 md:py-20">
      <section className="grid gap-12 md:grid-cols-[1.1fr_0.9fr] md:items-center">
        <div className="animate-rise-fade">
          <p className="text-sm tracking-wide text-muted mb-4">A live, 1-versus-1 browser duel</p>
          <h1 className="font-display font-800 text-5xl md:text-6xl leading-[1.05] text-paper">
            Cast with
            <br />
            your hands.
          </h1>
          <p className="mt-6 max-w-md text-base md:text-lg text-muted leading-relaxed">
            No keyboard, no mouse. Show your webcam a hand sign and the arena answers — fire, lightning, a
            raised guard. Send a friend a room code and fight it out live.
          </p>

          <div className="mt-8 rounded-none border border-ink-line bg-ink-panel/60 p-5 max-w-md">
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setMode("create")}
                className={`focus-ring flex-1 py-2 text-sm font-medium border transition-colors ${
                  mode === "create" ? "border-chakra bg-chakra/10 text-chakra-bright" : "border-ink-line text-muted hover:text-paper"
                }`}
              >
                Create a duel
              </button>
              <button
                onClick={() => setMode("join")}
                className={`focus-ring flex-1 py-2 text-sm font-medium border transition-colors ${
                  mode === "join" ? "border-ember bg-ember/10 text-ember-bright" : "border-ink-line text-muted hover:text-paper"
                }`}
              >
                Join with code
              </button>
            </div>

            <label className="block text-xs uppercase tracking-wide text-muted mb-1">Your name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={16}
              placeholder="Challenger"
              className="focus-ring w-full bg-ink border border-ink-line px-3 py-2 text-paper placeholder:text-muted/60 mb-3"
            />

            {mode === "join" && (
              <>
                <label className="block text-xs uppercase tracking-wide text-muted mb-1">Room code</label>
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  maxLength={5}
                  placeholder="X7K29"
                  className="focus-ring w-full bg-ink border border-ink-line px-3 py-2 tracking-[0.3em] text-paper placeholder:text-muted/40 mb-3 font-mono"
                />
              </>
            )}

            {error && <p className="text-sm text-danger mb-3">{error}</p>}

            <button
              onClick={go}
              className="focus-ring w-full py-3 bg-chakra text-ink font-semibold hover:bg-chakra-bright transition-colors"
            >
              {mode === "create" ? "Create room" : "Join room"}
            </button>
            <p className="mt-3 text-xs text-muted">Needs a webcam. Works best in Chrome or Edge, on a laptop or desktop.</p>
          </div>
        </div>

        <div className="relative aspect-square max-w-md mx-auto w-full">
          <div className="absolute inset-0 rounded-full border border-ink-line animate-seal-spin" style={{ borderStyle: "dashed" }} />
          <div className="absolute inset-8 rounded-full border border-ink-line/60" />
          <div className="absolute left-[18%] top-1/2 -translate-y-1/2 h-16 w-16 rounded-full bg-chakra shadow-glow" />
          <div className="absolute right-[18%] top-1/2 -translate-y-1/2 h-16 w-16 rounded-full bg-ember shadow-emberGlow" />
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 400">
            <path
              d="M 100 200 Q 200 120 300 200"
              fill="none"
              stroke="url(#boltGrad)"
              strokeWidth="2.5"
              strokeDasharray="6 8"
            />
            <defs>
              <linearGradient id="boltGrad" x1="0" x2="1">
                <stop offset="0%" stopColor="#7FE6FF" />
                <stop offset="100%" stopColor="#FF6A3D" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </section>

      <section className="mt-20 md:mt-28">
        <div className="brush-divider mb-10" />
        <h2 className="font-display text-2xl text-paper mb-2">How a duel works</h2>
        <ol className="mt-6 grid gap-6 md:grid-cols-3 text-sm text-muted">
          <li>
            <span className="text-paper font-semibold">1. Share the room</span>
            <p className="mt-1">Create a duel, send the code or link to your opponent. Both of you open it in a browser.</p>
          </li>
          <li>
            <span className="text-paper font-semibold">2. Show your hand</span>
            <p className="mt-1">Allow the camera, hold your hand where it can see it. The HUD confirms once it's tracking.</p>
          </li>
          <li>
            <span className="text-paper font-semibold">3. Cast and dodge</span>
            <p className="mt-1">Best of three rounds. First to drop the other's health to zero twice wins the duel.</p>
          </li>
        </ol>
      </section>

      <section className="mt-16 md:mt-20 pb-10">
        <h2 className="font-display text-2xl text-paper mb-6">The signs</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {ABILITIES.map((a) => (
            <div key={a.name} className="border border-ink-line bg-ink-panel/50 p-4">
              <div className={`text-2xl mb-2 ${a.color}`}>{a.sign}</div>
              <div className="text-paper font-semibold text-sm">{a.name}</div>
              <div className="text-muted text-xs mt-1 leading-snug">{a.desc}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
