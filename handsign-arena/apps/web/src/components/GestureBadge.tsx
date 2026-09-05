"use client";

import type { GestureName } from "@/lib/gesture/classifier";

const GESTURE_LABELS: Record<GestureName, { icon: string; label: string; color: string }> = {
  fist: { icon: "✊", label: "GUARD", color: "text-chakra-bright" },
  open_palm: { icon: "✋", label: "PRIMED", color: "text-chakra-bright" },
  peace: { icon: "✌️", label: "CAST", color: "text-ember-bright" },
  point: { icon: "☝️", label: "MOVE", color: "text-paper" },
  rock: { icon: "🤟", label: "MEND", color: "text-jade" },
  three: { icon: "🤟", label: "DASH", color: "text-paper" },
  none: { icon: "🖐️", label: "—", color: "text-muted" },
};

export function GestureBadge({
  gesture,
  confidence,
  handPresent,
  compact = false,
}: {
  gesture: GestureName;
  confidence: number;
  handPresent: boolean;
  compact?: boolean;
}) {
  const meta = GESTURE_LABELS[gesture];
  const pct = Math.round(confidence * 100);

  return (
    <div
      className={`select-none border border-ink-line bg-ink/80 backdrop-blur-sm px-3 py-2 ${compact ? "text-xs" : "text-sm"} flex items-center gap-2 min-w-[128px]`}
    >
      <span className="text-lg leading-none">{meta.icon}</span>
      <div className="flex-1">
        <div className={`font-semibold tracking-wide ${meta.color}`}>{meta.label}</div>
        {gesture !== "none" && (
          <div className="mt-1 h-1 w-full bg-ink-line overflow-hidden">
            <div className="h-full bg-current transition-all duration-150" style={{ width: `${pct}%`, color: "currentColor" }} />
          </div>
        )}
      </div>
      {!handPresent && <span className="text-[10px] text-muted uppercase">no hand</span>}
    </div>
  );
}
