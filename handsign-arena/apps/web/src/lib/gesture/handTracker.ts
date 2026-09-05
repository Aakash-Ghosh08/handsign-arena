import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from "@mediapipe/tasks-vision";

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

let sharedLandmarkerPromise: Promise<HandLandmarker> | null = null;

/** The landmarker is expensive to spin up (~loads a wasm + model), so share one instance per tab. */
function getLandmarker(): Promise<HandLandmarker> {
  if (!sharedLandmarkerPromise) {
    sharedLandmarkerPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
      return HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.5,
      });
    })().catch(async (err) => {
      // GPU delegate isn't available on every machine/browser — fall back to CPU rather than dying.
      console.warn("GPU delegate failed for hand landmarker, retrying on CPU", err);
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
      return HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.5,
      });
    });
  }
  return sharedLandmarkerPromise;
}

export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private ready = false;

  async init() {
    this.landmarker = await getLandmarker();
    this.ready = true;
  }

  get isReady() {
    return this.ready;
  }

  /** Must be called with a strictly increasing timestamp (ms) per video element. */
  detect(video: HTMLVideoElement, timestampMs: number): HandLandmarkerResult | null {
    if (!this.landmarker || video.readyState < 2) return null;
    return this.landmarker.detectForVideo(video, timestampMs);
  }
}
