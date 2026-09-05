"use client";

import { useEffect, useRef, useState } from "react";
import type { HandTrackingHandle } from "@/lib/gesture/useHandTracking";
import { GestureBadge } from "./GestureBadge";

export function LandmarkOverlay({ tracking }: { tracking: HandTrackingHandle }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let raf: number;
    const draw = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const pts = tracking.getLandmarks();
        if (pts) {
          ctx.fillStyle = "#7FE6FF";
          for (const p of pts) {
            ctx.beginPath();
            ctx.arc(p.x * canvas.width, p.y * canvas.height, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [tracking]);

  return <canvas ref={canvasRef} width={480} height={360} className="absolute inset-0 h-full w-full" />;
}

export function CameraSetup({
  tracking,
  practiceComplete,
  onPracticeComplete,
}: {
  tracking: HandTrackingHandle;
  practiceComplete: boolean;
  onPracticeComplete: () => void;
}) {
  const { videoRef, state, start } = tracking;
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (state.gesture === "peace" && state.confidence > 0.6 && !practiceComplete) {
      onPracticeComplete();
    }
  }, [state.gesture, state.confidence, practiceComplete, onPracticeComplete]);

  return (
    <div className="border border-ink-line bg-ink-panel/60 p-5">
      <div className="relative aspect-[4/3] w-full max-w-sm mx-auto bg-black overflow-hidden border border-ink-line">
        <video ref={videoRef} className="h-full w-full object-cover -scale-x-100" playsInline muted />
        {state.cameraStatus === "ready" && <LandmarkOverlay tracking={tracking} />}
        <div className="absolute bottom-2 left-2">
          <GestureBadge gesture={state.gesture} confidence={state.confidence} handPresent={state.handPresent} compact />
        </div>

        {state.cameraStatus === "idle" && !started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 p-4 text-center">
            <p className="text-sm text-muted">Your camera stays on your device — nothing is ever sent to the server.</p>
            <button
              onClick={() => {
                setStarted(true);
                start();
              }}
              className="focus-ring bg-chakra text-ink font-semibold px-4 py-2 text-sm hover:bg-chakra-bright transition-colors"
            >
              Enable camera
            </button>
          </div>
        )}

        {state.cameraStatus === "requesting" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-muted">Requesting camera access…</div>
        )}

        {state.cameraStatus === "denied" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 p-4 text-center text-sm">
            <p className="text-danger font-medium">Camera access was blocked.</p>
            <p className="text-muted">Click the camera icon in your address bar, allow access, then refresh this page.</p>
          </div>
        )}

        {state.cameraStatus === "unavailable" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-4 text-center text-sm text-danger">
            No camera was found on this device.
          </div>
        )}

        {state.cameraStatus === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 p-4 text-center text-sm">
            <p className="text-danger font-medium">Hand tracking failed to start.</p>
            <button onClick={() => start()} className="focus-ring underline text-chakra-bright">
              Try again
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 max-w-sm mx-auto text-sm">
        {state.cameraStatus === "ready" && !state.handPresent && (
          <p className="text-muted">Move your hand into frame, about arm's length from the camera.</p>
        )}
        {state.cameraStatus === "ready" && state.handPresent && !practiceComplete && (
          <p className="text-paper">
            Tracking locked on. Now try casting: hold up a <span className="text-ember-bright font-medium">peace sign ✌️</span>, aimed
            anywhere, to confirm recognition.
          </p>
        )}
        {practiceComplete && <p className="text-jade font-medium">Recognized! You're ready to duel.</p>}
      </div>
    </div>
  );
}
