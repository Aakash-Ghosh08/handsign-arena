// ============================================================================
// This is a from-scratch rewrite of the original repo's `handsigns.py` /
// `helperMethods.py` boolean classifiers. Two structural problems in the
// original motivated the rewrite:
//
// 1. Every check was a hard boolean ("is this finger straight, yes/no" at a
//    fixed 0.95 ratio threshold). A finger at 0.94 confidence silently read
//    as "curled" with no signal that the player was *close*. That's what
//    produces the "hold your hand in an unnaturally precise position"
//    problem the brief calls out.
// 2. Direction was computed with an SVD principal-axis fit
//    (`helperMethods.angle`), which has a sign ambiguity — the returned axis
//    can point either way along the line, so "which way is the player
//    pointing" was not actually well-defined.
//
// This version scores each finger on a continuous 0..1 "extended-ness" and
// produces a soft match confidence per gesture, and computes direction as a
// concrete base->tip vector, which has no sign ambiguity.
// ============================================================================

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export type GestureName = "fist" | "open_palm" | "peace" | "point" | "rock" | "three" | "none";

export interface ClassificationResult {
  gesture: GestureName;
  confidence: number; // 0..1
  direction: { x: number; y: number }; // meaningful for point / peace / three, zero vector otherwise
}

const FINGERS = {
  thumb: [1, 2, 3, 4],
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
} as const;

type FingerName = keyof typeof FINGERS;

function dist(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Continuous "how extended is this finger" score, in [0, ~1.05].
 * Same core ratio idea as the original (curl-path-length vs base-to-tip
 * distance) but returned as a continuous value rather than thresholded here.
 */
function extension(hand: Landmark[], finger: FingerName): number {
  const [mcp, pip, dip, tip] = FINGERS[finger];
  const straight = dist(hand[tip], hand[mcp]);
  const path = dist(hand[mcp], hand[pip]) + dist(hand[pip], hand[dip]) + dist(hand[dip], hand[tip]);
  if (path < 1e-6) return 0;
  return straight / path;
}

/** Maps a raw extension ratio to a soft 0..1 "confidently extended" score with a dead zone in the middle. */
function softExtended(ratio: number): number {
  const LOW = 0.72; // below this, confidently curled
  const HIGH = 0.9; // above this, confidently extended
  if (ratio <= LOW) return 0;
  if (ratio >= HIGH) return 1;
  return (ratio - LOW) / (HIGH - LOW);
}

interface FingerScores {
  thumb: number;
  index: number;
  middle: number;
  ring: number;
  pinky: number;
}

function scoreFingers(hand: Landmark[]): FingerScores {
  return {
    thumb: softExtended(extension(hand, "thumb")),
    index: softExtended(extension(hand, "index")),
    middle: softExtended(extension(hand, "middle")),
    ring: softExtended(extension(hand, "ring")),
    pinky: softExtended(extension(hand, "pinky")),
  };
}

/** A gesture signature: expected extended-ness (1 = should be out, 0 = should be curled) per finger. */
const SIGNATURES: Record<Exclude<GestureName, "none">, FingerScores> = {
  fist: { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 },
  open_palm: { thumb: 1, index: 1, middle: 1, ring: 1, pinky: 1 },
  peace: { thumb: 0, index: 1, middle: 1, ring: 0, pinky: 0 },
  point: { thumb: 0, index: 1, middle: 0, ring: 0, pinky: 0 },
  rock: { thumb: 1, index: 1, middle: 0, ring: 0, pinky: 1 }, // "sage sign": thumb+index+pinky out
  three: { thumb: 0, index: 1, middle: 1, ring: 1, pinky: 0 },
};

function matchScore(observed: FingerScores, signature: FingerScores): number {
  const fingers: FingerName[] = ["thumb", "index", "middle", "ring", "pinky"];
  let total = 0;
  for (const f of fingers) {
    const target = signature[f];
    const got = observed[f];
    // 1 - |target - got| gives 1.0 for a perfect match on that finger, 0 for total mismatch
    total += 1 - Math.abs(target - got);
  }
  return total / fingers.length;
}

/** Base->tip vector for a finger, in the hand's own coordinate space (already mirror-corrected by the caller). */
function fingerDirection(hand: Landmark[], finger: FingerName): { x: number; y: number } {
  const [mcp, , , tip] = FINGERS[finger];
  const dx = hand[tip].x - hand[mcp].x;
  const dy = hand[tip].y - hand[mcp].y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/**
 * Classify a single frame's landmarks. `mirrored` should be true when the
 * landmarks came from a selfie-mirrored video feed (the normal case) — the
 * classifier will un-mirror x so left/right in gesture logic matches what
 * the finger-extension math expects, while direction output stays in the
 * "what the player sees on screen" space so pointing right visually moves
 * the character right.
 */
export function classifyHand(rawLandmarks: Landmark[], mirrored: boolean): ClassificationResult {
  const hand = mirrored ? rawLandmarks.map((l) => ({ x: 1 - l.x, y: l.y, z: l.z })) : rawLandmarks;

  const observed = scoreFingers(hand);

  let best: GestureName = "none";
  let bestScore = 0.55; // floor — below this we report "none" rather than guessing
  for (const name of Object.keys(SIGNATURES) as (keyof typeof SIGNATURES)[]) {
    const score = matchScore(observed, SIGNATURES[name]);
    if (score > bestScore) {
      bestScore = score;
      best = name;
    }
  }

  let direction = { x: 0, y: 0 };
  if (best === "point") direction = fingerDirection(hand, "index");
  else if (best === "peace") direction = fingerDirection(hand, "index");
  else if (best === "three") direction = fingerDirection(hand, "middle");

  // direction was computed in un-mirrored space; flip x back to screen space
  if (mirrored) direction = { x: -direction.x, y: direction.y };

  return { gesture: best, confidence: bestScore, direction };
}
