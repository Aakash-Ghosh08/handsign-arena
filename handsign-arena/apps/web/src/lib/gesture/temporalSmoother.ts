import {
  GESTURE_CONFIRM_RATIO,
  GESTURE_MIN_CONFIDENCE,
  GESTURE_RETRIGGER_COOLDOWN_MS,
  GESTURE_WINDOW_SIZE,
} from "@handsign/shared";
import type { ClassificationResult, GestureName } from "./classifier";

interface Sample {
  gesture: GestureName;
  confidence: number;
  direction: { x: number; y: number };
  t: number;
}

export interface SmoothedGesture {
  gesture: GestureName;
  confidence: number; // average confidence supporting the stable call
  direction: { x: number; y: number };
  /** true only on the single tick the gesture transitions into a *new* stable value */
  justEntered: boolean;
  handPresent: boolean;
}

/**
 * Sliding-window majority vote with hysteresis:
 *  - a frame only counts if its own confidence clears GESTURE_MIN_CONFIDENCE
 *  - the window's plurality gesture only becomes "stable" once it holds
 *    GESTURE_CONFIRM_RATIO of the window
 *  - once stable, a short retrigger cooldown stops one gesture from
 *    re-firing an edge event on tiny window jitter (e.g. one dropped frame)
 */
export class TemporalGestureSmoother {
  private window: Sample[] = [];
  private stable: GestureName = "none";
  private lastEnteredAt = 0;

  push(result: ClassificationResult | null, now: number): SmoothedGesture {
    if (result && result.confidence >= GESTURE_MIN_CONFIDENCE) {
      this.window.push({ gesture: result.gesture, confidence: result.confidence, direction: result.direction, t: now });
    } else {
      this.window.push({ gesture: "none", confidence: 1, direction: { x: 0, y: 0 }, t: now });
    }
    while (this.window.length > GESTURE_WINDOW_SIZE) this.window.shift();

    const counts = new Map<GestureName, number>();
    for (const s of this.window) counts.set(s.gesture, (counts.get(s.gesture) ?? 0) + 1);

    let winner: GestureName = "none";
    let winnerCount = 0;
    for (const [g, c] of counts) {
      if (c > winnerCount) {
        winner = g;
        winnerCount = c;
      }
    }

    const ratio = winnerCount / this.window.length;
    const candidate = ratio >= GESTURE_CONFIRM_RATIO ? winner : "none";

    let justEntered = false;
    if (candidate !== this.stable) {
      if (now - this.lastEnteredAt >= GESTURE_RETRIGGER_COOLDOWN_MS) {
        this.stable = candidate;
        this.lastEnteredAt = now;
        justEntered = true;
      }
    }

    const supportingSamples = this.window.filter((s) => s.gesture === this.stable);
    const avgConfidence = supportingSamples.length
      ? supportingSamples.reduce((sum, s) => sum + s.confidence, 0) / supportingSamples.length
      : 0;

    // direction: use the most recent sample matching the stable gesture, so
    // aim tracks the player's hand in real time even while the *identity*
    // of the gesture is debounced.
    const latestMatching = [...this.window].reverse().find((s) => s.gesture === this.stable);

    return {
      gesture: this.stable,
      confidence: avgConfidence,
      direction: latestMatching?.direction ?? { x: 0, y: 0 },
      justEntered,
      handPresent: result !== null,
    };
  }

  reset() {
    this.window = [];
    this.stable = "none";
    this.lastEnteredAt = 0;
  }
}
