// Browser port of handSignGame/src/handsigns.py and helperMethods.py.

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export type GestureName = "fist" | "open_palm" | "peace" | "point" | "rock" | "three" | "none";

export interface FingerStates {
  thumb: boolean;
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
}

export interface ClassificationResult {
  gesture: GestureName;
  confidence: number;
  direction: { x: number; y: number };
  fingerStates: FingerStates;
  handX: number;
}

const STRAIGHTNESS_THRESHOLD = 0.95;
const FINGERS = {
  thumb: [1, 2, 3, 4],
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
} as const;

type FingerName = keyof typeof FINGERS;

function distance(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** OG helperMethods.is_finger_straight: path ratio must be strictly above .95. */
function isFingerStraight(hand: Landmark[], finger: FingerName): boolean {
  const [mcp, pip, dip, tip] = FINGERS[finger];
  const path = distance(hand[mcp], hand[pip]) + distance(hand[pip], hand[dip]) + distance(hand[dip], hand[tip]);
  return path > 0 && distance(hand[tip], hand[mcp]) / path > STRAIGHTNESS_THRESHOLD;
}

function getFingerStates(hand: Landmark[]): FingerStates {
  return {
    thumb: isFingerStraight(hand, "thumb"),
    index: isFingerStraight(hand, "index"),
    middle: isFingerStraight(hand, "middle"),
    ring: isFingerStraight(hand, "ring"),
    pinky: isFingerStraight(hand, "pinky"),
  };
}

function allCurled(states: FingerStates): boolean {
  return !states.thumb && !states.index && !states.middle && !states.ring && !states.pinky;
}

function allStraight(states: FingerStates): boolean {
  return states.thumb && states.index && states.middle && states.ring && states.pinky;
}

/** OG helperMethods.angle: principal axis of landmarks 5..8, oriented toward the fingertip. */
function directionFromIndex(hand: Landmark[]): { x: number; y: number } {
  const points = [5, 6, 7, 8].map((index) => hand[index]);
  const centerX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const centerY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  let xx = 0;
  let xy = 0;
  let yy = 0;
  for (const point of points) {
    const x = point.x - centerX;
    const y = point.y - centerY;
    xx += x * x;
    xy += x * y;
    yy += y * y;
  }

  const theta = 0.5 * Math.atan2(2 * xy, xx - yy);
  let direction = { x: Math.cos(theta), y: Math.sin(theta) };
  const tipDirection = { x: hand[8].x - hand[5].x, y: hand[8].y - hand[5].y };
  if (direction.x * tipDirection.x + direction.y * tipDirection.y < 0) {
    direction = { x: -direction.x, y: -direction.y };
  }
  return direction;
}

/**
 * Classify in visual coordinates. MediaPipe landmarks come from the unmirrored
 * camera stream, while the video is displayed with scaleX(-1), so x is flipped
 * exactly once before direction is returned to gameplay.
 */
export function classifyHand(rawLandmarks: Landmark[], mirrored: boolean): ClassificationResult {
  const hand = mirrored ? rawLandmarks.map((point) => ({ ...point, x: 1 - point.x })) : rawLandmarks;
  const fingerStates = getFingerStates(hand);
  let gesture: GestureName = "none";

  // Preserve the original handsigns.py order. Peace intentionally ignores the thumb,
  // as does the OG classifier, so ambiguous signs resolve the same way.
  if (allCurled(fingerStates)) gesture = "fist";
  else if (allStraight(fingerStates)) gesture = "open_palm";
  else if (fingerStates.index && fingerStates.middle && !fingerStates.ring && !fingerStates.pinky) gesture = "peace";
  else if (fingerStates.index && !fingerStates.middle && !fingerStates.ring && !fingerStates.pinky) gesture = "point";
  else if (fingerStates.thumb && fingerStates.index && !fingerStates.middle && !fingerStates.ring && fingerStates.pinky) gesture = "rock";
  else if (!fingerStates.thumb && fingerStates.index && fingerStates.middle && fingerStates.ring && !fingerStates.pinky) gesture = "three";

  const directional = gesture === "point" || gesture === "peace" || gesture === "three";
  return {
    gesture,
    confidence: gesture === "none" ? 0 : 1,
    direction: directional ? directionFromIndex(hand) : { x: 0, y: 0 },
    fingerStates,
    handX: hand[0]?.x ?? 0.5,
  };
}
