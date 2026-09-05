"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameState, PlayerSlot, ServerMessage } from "@handsign/shared";
import { GameSocket, resolveServerUrl, type ConnectionStatus } from "@/lib/net/socket";
import { useHandTracking } from "@/lib/gesture/useHandTracking";
import { CameraSetup, LandmarkOverlay } from "@/components/CameraSetup";
import { LobbyStatus } from "@/components/LobbyStatus";
import { Arena, type ArenaHandle } from "@/components/Arena";
import { MatchHud } from "@/components/MatchHud";
import { PointOverBanner, VictoryOverlay } from "@/components/MatchOverlays";

type LocalPhase = "connecting" | "room_error" | "in_room";

export default function RoomPage({ params, searchParams }: { params: { code: string }; searchParams: { name?: string } }) {
  const name = searchParams?.name?.slice(0, 16) || "Challenger";
  const requestedCode = params.code;

  const socketRef = useRef<GameSocket | null>(null);
  const arenaRef = useRef<ArenaHandle>(null);
  const phaseRef = useRef<GameState["phase"]>("waiting_for_players");

  const [localPhase, setLocalPhase] = useState<LocalPhase>("connecting");
  const [roomError, setRoomError] = useState<string | null>(null);
  const [mySlot, setMySlot] = useState<PlayerSlot | null>(null);
  const [roomCode, setRoomCode] = useState<string>(requestedCode === "new" ? "" : requestedCode.toUpperCase());
  const [connStatus, setConnStatus] = useState<ConnectionStatus>("connecting");
  const [displayState, setDisplayState] = useState<GameState | null>(null);
  const [practiceComplete, setPracticeComplete] = useState(false);
  const [rematchRequested, setRematchRequested] = useState(false);
  const lastHudUpdate = useRef(0);
  const lastPlayingGestureLog = useRef(0);
  const lastStateLog = useRef(0);

  const handleGesture = useCallback(
    (g: { gesture: string; direction: { x: number; y: number }; confidence: number; justEntered: boolean }) => {
      if (phaseRef.current === "in_progress" && performance.now() - lastPlayingGestureLog.current > 500) {
        lastPlayingGestureLog.current = performance.now();
        console.info(`[gesture] playing gesture: ${g.gesture}`, { justEntered: g.justEntered });
      }
      socketRef.current?.send({
        type: "gesture",
        gesture: g.gesture as any,
        dir: g.direction,
        confidence: g.confidence,
        t: Date.now(),
      });
    },
    []
  );

  const tracking = useHandTracking(handleGesture);
  const trackingStateRef = useRef(tracking.state);
  trackingStateRef.current = tracking.state;

  // connect + create/join
  useEffect(() => {
    const socketUrl = resolveServerUrl();
    console.info("[room] Opening room socket", { requestedCode, action: requestedCode === "new" ? "create" : "join" });
    const socket = new GameSocket(socketUrl);
    socketRef.current = socket;

    const initialMsg =
      requestedCode === "new" ? ({ type: "create", name } as const) : ({ type: "join", roomCode: requestedCode, name } as const);
    console.info("[room] Prepared room message", initialMsg.type === "create" ? { type: initialMsg.type } : initialMsg);
    socket.setReplayOnOpen(initialMsg);

    const unsubStatus = socket.onStatus(setConnStatus);
    const unsubMsg = socket.onMessage((msg: ServerMessage) => {
      if (msg.type === "room_created" || msg.type === "room_joined" || msg.type === "room_error") {
        console.info("[room] Received room response", msg);
      }
      switch (msg.type) {
        case "room_created":
          setMySlot(msg.slot);
          setRoomCode(msg.roomCode);
          setLocalPhase("in_room");
          console.info("[room] Navigating to created room", { roomCode: msg.roomCode });
          window.history.replaceState(null, "", `/room/${msg.roomCode}?name=${encodeURIComponent(name)}`);
          break;
        case "room_joined":
          console.info("[room] Joined room", { roomCode: msg.roomCode, slot: msg.slot });
          setMySlot(msg.slot);
          setRoomCode(msg.roomCode);
          setLocalPhase("in_room");
          break;
        case "room_error":
          setRoomError(
            msg.reason === "not_found"
              ? "That room doesn't exist or has closed."
              : msg.reason === "full"
              ? "That room already has two players."
              : "That room code isn't valid."
          );
          setLocalPhase("room_error");
          break;
        case "state": {
          if (msg.state.phase !== phaseRef.current) {
            console.info("[game] phase transition", { from: phaseRef.current, to: msg.state.phase });
          }
          phaseRef.current = msg.state.phase;
          if (performance.now() - lastStateLog.current > 1000) {
            lastStateLog.current = performance.now();
            console.info("[game] received state", {
              phase: msg.state.phase,
              p1: msg.state.players.p1.pos,
              p2: msg.state.players.p2.pos,
            });
          }
          arenaRef.current?.pushState(msg.state);
          const now = performance.now();
          if (now - lastHudUpdate.current > 66 || msg.state.phase !== displayState?.phase) {
            lastHudUpdate.current = now;
            setDisplayState(msg.state);
          }
          break;
        }
      }
    });

    socket.connect();

    return () => {
      unsubStatus();
      unsubMsg();
      socket.close();
      tracking.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // report camera status to the server whenever it changes
  useEffect(() => {
    socketRef.current?.send({
      type: "camera_status",
      ready: tracking.state.cameraStatus === "ready",
      handDetected: tracking.state.handPresent,
    });
  }, [tracking.state.cameraStatus, tracking.state.handPresent]);

  const onRematch = useCallback(() => {
    setRematchRequested(true);
    socketRef.current?.send({ type: "rematch_request" });
  }, []);

  useEffect(() => {
    if (displayState?.phase === "countdown") setRematchRequested(false);
  }, [displayState?.phase]);

  const phase = displayState?.phase ?? "waiting_for_players";
  useEffect(() => {
    if (phase === "in_progress") {
      console.info("[gesture] gameplay phase active; reattaching camera video");
      void tracking.attachVideo();
    }
  }, [phase, tracking.attachVideo]);

  if (localPhase === "connecting") {
    return <CenteredMessage title="Connecting…" body="Setting up your duel." />;
  }

  if (localPhase === "room_error") {
    return (
      <CenteredMessage title="Room unavailable" body={roomError ?? "Something went wrong."}>
        <a href="/" className="focus-ring text-chakra-bright underline text-sm">
          Back to home
        </a>
      </CenteredMessage>
    );
  }

  if (!mySlot) return <CenteredMessage title="Connecting…" body="" />;

  const oppSlot: PlayerSlot = mySlot === "p1" ? "p2" : "p1";
  const opponentConnected = displayState?.players[oppSlot]?.connected ?? false;

  return (
    <main className="min-h-screen flex flex-col">
      {connStatus === "reconnecting" && (
        <div className="bg-danger/90 text-ink text-center text-sm py-1.5 font-medium">Connection lost — reconnecting…</div>
      )}
      {displayState && !opponentConnected && phase !== "waiting_for_players" && phase !== "match_over" && (
        <div className="bg-[#F4C24B]/90 text-ink text-center text-sm py-1.5 font-medium">
          Opponent disconnected — waiting for them to rejoin…
        </div>
      )}

      {(phase === "waiting_for_players" || phase === "camera_setup" || phase === "countdown") && (
        <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6 py-10">
          <div className="text-center">
            <h1 className="font-display text-3xl text-paper">Lobby</h1>
            <p className="text-muted text-sm mt-1">
              {phase === "waiting_for_players" ? "Waiting for an opponent to join." : "Get your camera ready to begin."}
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 w-full max-w-3xl items-start">
            <LobbyStatus
              roomCode={roomCode}
              mySlot={mySlot}
              state={displayState}
              selfCameraReady={tracking.state.cameraStatus === "ready"}
              selfHandDetected={tracking.state.handPresent}
            />
            <CameraSetup tracking={tracking} practiceComplete={practiceComplete} onPracticeComplete={() => setPracticeComplete(true)} />
          </div>
          {phase === "countdown" && displayState && (
            <p className="text-paper font-display text-2xl">Starting in {Math.ceil((displayState.countdownMs ?? 0) / 1000)}…</p>
          )}
        </div>
      )}

      {(phase === "in_progress" || phase === "point_over" || phase === "match_over") && displayState && (
        <div className="relative flex-1 min-h-[70vh]">
          <Arena ref={arenaRef} />
          <MatchHud
            state={displayState}
            mySlot={mySlot}
            myGesture={tracking.state.gesture}
            myConfidence={tracking.state.confidence}
            myHandPresent={tracking.state.handPresent}
          />
          <GestureDebugOverlay tracking={tracking.state} />

          {/* small self-camera corner, so the camera stays part of the game rather than a raw floating rectangle */}
          <div className="absolute bottom-4 left-4 w-40 aspect-[4/3] border border-ink-line bg-black overflow-hidden">
            <video ref={tracking.videoRef} className="h-full w-full object-cover -scale-x-100" playsInline muted />
            <LandmarkOverlay tracking={tracking} />
          </div>

          {phase === "point_over" && <PointOverBanner state={displayState} mySlot={mySlot} />}
          {phase === "match_over" && (
            <VictoryOverlay
              state={displayState}
              mySlot={mySlot}
              onRematch={onRematch}
              rematchRequested={rematchRequested}
              opponentConnected={opponentConnected}
            />
          )}
        </div>
      )}
    </main>
  );
}

function CenteredMessage({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <h1 className="font-display text-2xl text-paper mb-2">{title}</h1>
        {body && <p className="text-muted text-sm mb-4">{body}</p>}
        {children}
      </div>
    </main>
  );
}

function GestureDebugOverlay({ tracking }: { tracking: ReturnType<typeof useHandTracking>["state"] }) {
  const fingers = tracking.fingerStates;
  const fingerSummary = Object.entries(fingers)
    .map(([name, extended]) => `${name[0].toUpperCase()}${extended ? "+" : "-"}`)
    .join(" ");
  return (
    <div className="absolute right-4 bottom-4 z-10 border border-ink-line bg-ink/85 p-3 text-[11px] text-muted pointer-events-none font-mono">
      <div className="text-paper font-semibold mb-1">Gesture debug</div>
      <div>raw: <span className="text-paper">{tracking.rawGesture}</span></div>
      <div>stable: <span className="text-paper">{tracking.gesture}</span></div>
      <div>fingers: <span className="text-paper">{fingerSummary}</span></div>
      <div>hand x: <span className="text-paper">{tracking.handX.toFixed(2)}</span></div>
      <div>direction: <span className="text-paper">{tracking.direction.x.toFixed(2)}, {tracking.direction.y.toFixed(2)}</span></div>
      <div>last action: <span className="text-paper">{tracking.lastActionSent}</span></div>
    </div>
  );
}
