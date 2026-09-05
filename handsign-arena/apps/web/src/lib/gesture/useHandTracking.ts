"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HandTracker } from "./handTracker";
import { classifyHand, type FingerStates, type GestureName } from "./classifier";
import { TemporalGestureSmoother } from "./temporalSmoother";

export type CameraStatus = "idle" | "requesting" | "ready" | "denied" | "unavailable" | "error";

export interface HandTrackingState {
  cameraStatus: CameraStatus;
  handPresent: boolean;
  rawGesture: GestureName;
  gesture: GestureName;
  confidence: number;
  direction: { x: number; y: number };
  fingerStates: FingerStates;
  handX: number;
  lastActionSent: string;
  fps: number;
}

export interface HandTrackingHandle {
  videoRef: React.RefObject<HTMLVideoElement>;
  attachVideo: () => Promise<void>;
  state: HandTrackingState;
  start: () => Promise<void>;
  stop: () => void;
  /** normalized (0..1) landmark points of the tracked hand, in screen (mirrored) space — for overlay drawing */
  getLandmarks: () => { x: number; y: number }[] | null;
}

const MIRRORED = true;

export function useHandTracking(onStableGesture?: (g: { gesture: GestureName; direction: { x: number; y: number }; confidence: number; justEntered: boolean }) => void): HandTrackingHandle {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackerRef = useRef<HandTracker | null>(null);
  const smootherRef = useRef(new TemporalGestureSmoother());
  const rafRef = useRef<number | null>(null);
  const landmarksRef = useRef<{ x: number; y: number }[] | null>(null);
  const fpsRef = useRef({ last: performance.now(), count: 0, value: 0 });
  const onGestureRef = useRef(onStableGesture);
  onGestureRef.current = onStableGesture;

  const [state, setState] = useState<HandTrackingState>({
    cameraStatus: "idle",
    handPresent: false,
    rawGesture: "none",
    gesture: "none",
    confidence: 0,
    direction: { x: 0, y: 0 },
    fingerStates: { thumb: false, index: false, middle: false, ring: false, pinky: false },
    handX: 0.5,
    lastActionSent: "none",
    fps: 0,
  });

  const loop = useCallback(() => {
    const video = videoRef.current;
    const tracker = trackerRef.current;
    if (!video || !tracker || !tracker.isReady) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    const now = performance.now();
    const result = tracker.detect(video, now);

    let classified = null;
    if (result && result.landmarks && result.landmarks.length > 0) {
      const lm = result.landmarks[0];
      classified = classifyHand(lm, MIRRORED);
      landmarksRef.current = lm.map((p) => (MIRRORED ? { x: 1 - p.x, y: p.y } : { x: p.x, y: p.y }));
    } else {
      landmarksRef.current = null;
    }

    const smoothed = smootherRef.current.push(classified, now);

    const action = smoothed.gesture === "point"
      ? `move_${smoothed.direction.x < -0.25 ? "left" : smoothed.direction.x > 0.25 ? "right" : "straight"}`
      : smoothed.justEntered && smoothed.gesture !== "none"
      ? smoothed.gesture
      : null;
    if (action) onGestureRef.current && setState((prev) => ({ ...prev, lastActionSent: action }));

    if (smoothed.justEntered && onGestureRef.current) {
      onGestureRef.current({
        gesture: smoothed.gesture,
        direction: smoothed.direction,
        confidence: smoothed.confidence,
        justEntered: true,
      });
    }
    // also stream direction updates for "point" continuously so movement tracks the live hand,
    // not just the moment the gesture was confirmed
    if (!smoothed.justEntered && smoothed.gesture === "point" && onGestureRef.current) {
      onGestureRef.current({ gesture: "point", direction: smoothed.direction, confidence: smoothed.confidence, justEntered: false });
    }

    fpsRef.current.count += 1;
    if (now - fpsRef.current.last > 500) {
      fpsRef.current.value = Math.round((fpsRef.current.count * 1000) / (now - fpsRef.current.last));
      fpsRef.current.count = 0;
      fpsRef.current.last = now;
    }

    setState((prev) => ({
      ...prev,
      handPresent: smoothed.handPresent,
      rawGesture: smoothed.rawGesture,
      gesture: smoothed.gesture,
      confidence: smoothed.confidence,
      direction: smoothed.direction,
      fingerStates: smoothed.fingerStates,
      handX: smoothed.handX,
      fps: fpsRef.current.value,
    }));

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const attachVideo = useCallback(async () => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    await video.play().catch(() => undefined);
  }, []);

  const start = useCallback(async () => {
    setState((prev) => ({ ...prev, cameraStatus: "requesting" }));
    if (!navigator.mediaDevices?.getUserMedia) {
      setState((prev) => ({ ...prev, cameraStatus: "unavailable" }));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      await attachVideo();
      if (!trackerRef.current) {
        trackerRef.current = new HandTracker();
      }
      await trackerRef.current.init();
      setState((prev) => ({ ...prev, cameraStatus: "ready" }));
      rafRef.current = requestAnimationFrame(loop);
    } catch (err: any) {
      if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
        setState((prev) => ({ ...prev, cameraStatus: "denied" }));
      } else if (err?.name === "NotFoundError") {
        setState((prev) => ({ ...prev, cameraStatus: "unavailable" }));
      } else {
        console.error("camera/tracker init failed", err);
        setState((prev) => ({ ...prev, cameraStatus: "error" }));
      }
    }
  }, [attachVideo, loop]);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    smootherRef.current.reset();
  }, []);

  useEffect(() => stop, [stop]);

  const getLandmarks = useCallback(() => landmarksRef.current, []);

  return { videoRef, attachVideo, state, start, stop, getLandmarks };
}
