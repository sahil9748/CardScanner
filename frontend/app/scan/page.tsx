"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  RefreshCw,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Shield,
  Layers,
  Sparkles,
  CreditCard,
  Maximize2,
  X,
  FlipHorizontal,
  ChevronRight,
  Play,
} from "lucide-react";
import confetti from "canvas-confetti";
import { useCamera } from "@/hooks/useCamera";
import { CardScanningEngine } from "@/lib/vision/detector";
import { DetectionResult, CapturePayload, QuadCorners } from "@/lib/vision/types";
import { api, ApiError } from "@/lib/api";

type ScanStep = "scanning_front" | "review_front" | "awaiting_back" | "scanning_back" | "review_both" | "completed";

export default function ScanPage() {
  const router = useRouter();
  const {
    videoRef,
    stream,
    devices,
    selectedDeviceId,
    selectDevice,
    isLoading: isCameraLoading,
    isPlaying,
    error: cameraError,
    isPermissionDenied,
    startCamera,
    resumeVideo,
    stopStream,
  } = useCamera();

  // Session state
  const [session, setSession] = useState<any>(null);
  const [isLoadingSession, setIsLoadingSession] = useState<boolean>(true);
  const [cardType, setCardType] = useState<"single" | "double">("single");

  // Workflow step
  const [step, setStep] = useState<ScanStep>("scanning_front");

  // Captured images state
  const [frontCapture, setFrontCapture] = useState<CapturePayload | null>(null);
  const [backCapture, setBackCapture] = useState<CapturePayload | null>(null);

  // Vision detection state
  const [detection, setDetection] = useState<DetectionResult>({
    detected: false,
    state: "searching",
    stateMessage: "Position card inside frame",
    corners: null,
    confidence: 0,
    stabilityProgress: 0,
    aspectRatio: 1.586,
    sharpness: 25,
  });

  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [completedCard, setCompletedCard] = useState<any>(null);

  const engineRef = useRef<CardScanningEngine | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Keep live step and cardType in refs so engine callbacks never become stale
  const stepRef = useRef<ScanStep>(step);
  const cardTypeRef = useRef<"single" | "double">(cardType);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);
  useEffect(() => {
    cardTypeRef.current = cardType;
  }, [cardType]);

  // 1. Load active session
  useEffect(() => {
    async function initSession() {
      try {
        const sessionData = await api.getCurrentSession();
        setSession(sessionData);
        setCardType(sessionData.card_type as "single" | "double");
      } catch (err) {
        // Unauthenticated -> redirect to PIN page
        router.push("/");
      } finally {
        setIsLoadingSession(false);
      }
    }
    initSession();
  }, [router]);

  // 2. Initialize camera once session is verified
  useEffect(() => {
    if (!isLoadingSession) {
      startCamera();
    }
  }, [isLoadingSession, startCamera]);

  // Handle capture callback from engine
  const handleEngineCapture = useCallback((payload: CapturePayload) => {
    const curStep = stepRef.current;
    const curType = cardTypeRef.current;

    if (curStep === "scanning_front") {
      setFrontCapture(payload);
      if (curType === "single") {
        setStep("review_front");
      } else {
        // Double-sided: transition to flip step
        setStep("awaiting_back");
      }
    } else if (curStep === "scanning_back") {
      setBackCapture(payload);
      setStep("review_both");
    }
  }, []);

  const handleEngineCaptureRef = useRef<(payload: CapturePayload) => void>(handleEngineCapture);
  useEffect(() => {
    handleEngineCaptureRef.current = handleEngineCapture;
  }, [handleEngineCapture]);

  // 3. Initialize Vision Engine (persists across step transitions without restart)
  useEffect(() => {
    if (!videoRef.current || !stream) return;

    const engine = new CardScanningEngine({
      processingWidth: 360,
      processingHeight: 240,
      stabilityDurationMs: 600,
      displacementThreshold: 26,
      onStateChange: (res) => {
        setDetection(res);
      },
      onCapture: (payload) => {
        handleEngineCaptureRef.current(payload);
      },
    });

    engineRef.current = engine;
    engine.start(videoRef.current);

    return () => {
      engine.stop();
      engineRef.current = null;
    };
  }, [videoRef, stream]);

  // 4. Render Guide Frame and Bounding Box on Overlay Canvas
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (step !== "scanning_front" && step !== "scanning_back") return;

    const w = canvas.width;
    const h = canvas.height;

    // A. Always draw the Card Alignment Guide Box in center
    const guideW = Math.round(w * 0.78);
    const guideH = Math.round(guideW / 1.586);
    const guideX = Math.round((w - guideW) / 2);
    const guideY = Math.round((h - guideH) / 2);
    const radius = 12;

    // Guide background vignette effect
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.roundRect(guideX, guideY, guideW, guideH, radius);
    ctx.fillStyle = "rgba(10, 15, 30, 0.35)";
    ctx.fill("evenodd");
    ctx.restore();

    // Guide box outline
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(guideX, guideY, guideW, guideH, radius);
    ctx.lineWidth = 2;
    ctx.strokeStyle = detection.detected ? "rgba(99, 102, 241, 0.4)" : "rgba(148, 163, 184, 0.35)";
    ctx.stroke();

    // Corner target brackets
    const bracketLen = 22;
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = detection.detected ? "#6366f1" : "rgba(255, 255, 255, 0.7)";

    // Top-Left
    ctx.beginPath();
    ctx.moveTo(guideX, guideY + bracketLen);
    ctx.lineTo(guideX, guideY);
    ctx.lineTo(guideX + bracketLen, guideY);
    ctx.stroke();

    // Top-Right
    ctx.beginPath();
    ctx.moveTo(guideX + guideW - bracketLen, guideY);
    ctx.lineTo(guideX + guideW, guideY);
    ctx.lineTo(guideX + guideW, guideY + bracketLen);
    ctx.stroke();

    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(guideX + guideW, guideY + guideH - bracketLen);
    ctx.lineTo(guideX + guideW, guideY + guideH);
    ctx.lineTo(guideX + guideW - bracketLen, guideY + guideH);
    ctx.stroke();

    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(guideX + bracketLen, guideY + guideH);
    ctx.lineTo(guideX, guideY + guideH);
    ctx.lineTo(guideX, guideY + guideH - bracketLen);
    ctx.stroke();
    ctx.restore();

    // B. Draw Detected Card Quadrilateral Overlay
    if (detection.corners) {
      const { topLeft, topRight, bottomRight, bottomLeft } = detection.corners;

      // Scale from detector coordinates (360x240) to overlay canvas coordinates
      const scaleX = w / 360;
      const scaleY = h / 240;

      const p1 = { x: topLeft.x * scaleX, y: topLeft.y * scaleY };
      const p2 = { x: topRight.x * scaleX, y: topRight.y * scaleY };
      const p3 = { x: bottomRight.x * scaleX, y: bottomRight.y * scaleY };
      const p4 = { x: bottomLeft.x * scaleX, y: bottomLeft.y * scaleY };

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.closePath();

      if (detection.state === "capturing") {
        ctx.strokeStyle = "#10b981"; // Emerald green
        ctx.fillStyle = "rgba(16, 185, 129, 0.35)";
        ctx.lineWidth = 4;
      } else if (detection.state === "stabilizing") {
        ctx.strokeStyle = "#6366f1"; // Indigo
        ctx.fillStyle = "rgba(99, 102, 241, 0.20)";
        ctx.lineWidth = 3;
      } else {
        ctx.strokeStyle = "#38bdf8"; // Sky blue
        ctx.fillStyle = "rgba(56, 189, 248, 0.10)";
        ctx.lineWidth = 2.5;
      }

      ctx.fill();
      ctx.stroke();

      // Corner target dots
      [p1, p2, p3, p4].forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();
      });
      ctx.restore();
    }
  }, [detection, step]);

  // Switch card type
  const handleCardTypeChange = async (newType: "single" | "double") => {
    if (newType === cardType) return;
    try {
      await api.updateCardType(newType);
      setCardType(newType);
      engineRef.current?.resetCaptureLock();
      setStep("scanning_front");
      setFrontCapture(null);
      setBackCapture(null);
    } catch (e) {
      console.error(e);
    }
  };

  // Retake side
  const handleRetake = (side: "front" | "back") => {
    if (side === "front") {
      setFrontCapture(null);
      setStep("scanning_front");
    } else {
      setBackCapture(null);
      setStep("scanning_back");
    }
    engineRef.current?.resetCaptureLock();
  };

  // Start back scanning after card flip
  const handleStartBackScan = () => {
    setStep("scanning_back");
    engineRef.current?.resetCaptureLock();
  };

  // Manual capture trigger
  const handleManualCapture = () => {
    if (engineRef.current) {
      engineRef.current.triggerManualCapture();
    }
  };

  // Save and Complete Scan
  const handleAcceptAndSave = async () => {
    if (!session || !frontCapture) return;
    if (cardType === "double" && !backCapture) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      // 1. Upload Front Image
      await api.uploadSessionImage(session.id, "front", frontCapture.originalBlob, frontCapture.processedBlob);

      // 2. Upload Back Image (if double-sided)
      if (cardType === "double" && backCapture) {
        await api.uploadSessionImage(session.id, "back", backCapture.originalBlob, backCapture.processedBlob);
      }

      // 3. Complete Session
      const completed = await api.completeSession(session.id);
      setCompletedCard(completed);
      setStep("completed");

      // Confetti celebration
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch (err: any) {
      const apiErr = err as ApiError;
      setUploadError(apiErr.detail || "Failed to upload and save card. Please retry.");
    } finally {
      setIsUploading(false);
    }
  };

  // Restart scan workflow for another card
  const handleScanAnother = () => {
    setFrontCapture(null);
    setBackCapture(null);
    setCompletedCard(null);
    setStep("scanning_front");
    engineRef.current?.resetCaptureLock();
    // Refresh session data
    api.getCurrentSession().then(setSession).catch(() => router.push("/"));
  };

  if (isLoadingSession) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
          <p className="text-sm text-slate-400">Verifying session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md px-4 sm:px-6 py-3.5 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-md shadow-indigo-500/20">
            <CreditCard className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white flex items-center gap-2">
              CardScan Engine
              {session?.pin_label && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  {session.pin_label}
                </span>
              )}
            </h1>
            <p className="text-xs text-slate-400">
              {session?.remaining_scans !== null && session?.remaining_scans !== undefined
                ? `${session.remaining_scans} scan${session.remaining_scans === 1 ? "" : "s"} remaining`
                : "Active Authorized Session"}
            </p>
          </div>
        </div>

        {/* Card Type Toggle (Disabled during review/completion) */}
        {step !== "completed" && (
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950 border border-slate-800">
            <button
              type="button"
              onClick={() => handleCardTypeChange("single")}
              disabled={step !== "scanning_front" && step !== "scanning_back"}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                cardType === "single"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200 disabled:opacity-40"
              }`}
            >
              1-Sided
            </button>
            <button
              type="button"
              onClick={() => handleCardTypeChange("double")}
              disabled={step !== "scanning_front" && step !== "scanning_back"}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                cardType === "double"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200 disabled:opacity-40"
              }`}
            >
              2-Sided
            </button>
          </div>
        )}
      </header>

      {/* Main Scanner Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 flex flex-col justify-center">
        {/* Permission Denied or Camera Error State */}
        {cameraError && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-6 text-center max-w-md mx-auto my-auto">
            <AlertTriangle className="w-10 h-10 text-rose-400 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-white mb-2">Camera Unavailable</h2>
            <p className="text-sm text-slate-300 mb-5">{cameraError}</p>
            <button
              onClick={() => startCamera()}
              className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-all shadow-md"
            >
              Retry Camera Permission
            </button>
          </div>
        )}

        {/* STEP 1 & 3: LIVE CAMERA PREVIEW */}
        {(step === "scanning_front" || step === "scanning_back") && !cameraError && (
          <div className="flex flex-col items-center">
            {/* Guide Badge */}
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-300 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                Scanning:{" "}
                <strong className="text-indigo-400">
                  {step === "scanning_front" ? "Front Side" : "Back Side"}
                </strong>
              </span>

              {devices.length > 1 && (
                <select
                  value={selectedDeviceId}
                  onChange={(e) => {
                    selectDevice(e.target.value);
                  }}
                  className="bg-slate-900 text-xs text-slate-300 border border-slate-800 rounded-lg px-2 py-1 outline-none focus:border-indigo-500"
                >
                  {devices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Video Viewport with Boundary Overlay */}
            <div
              onClick={resumeVideo}
              className="relative w-full max-w-2xl aspect-[4/3] sm:aspect-[16/10] rounded-3xl overflow-hidden bg-slate-900 border-2 border-slate-800 shadow-2xl flex items-center justify-center cursor-pointer"
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />

              {/* Real-time Canvas Overlay */}
              <canvas
                ref={overlayCanvasRef}
                width={640}
                height={480}
                className="absolute inset-0 w-full h-full pointer-events-none"
              />

              {/* iOS Touch-to-Play Overlay (Appears if Safari holds video paused) */}
              {stream && !isPlaying && !isCameraLoading && (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    resumeVideo();
                  }}
                  className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-10"
                >
                  <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-600/40 mb-3 animate-pulse">
                    <Play className="w-7 h-7 ml-0.5 fill-white" />
                  </div>
                  <h3 className="text-base font-bold text-white mb-1">Tap to Start Camera Preview</h3>
                  <p className="text-xs text-slate-300 max-w-xs">
                    iOS Safari requires user touch to activate inline camera video playback.
                  </p>
                </div>
              )}

              {/* Connecting Loading Indicator */}
              {isCameraLoading && (
                <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-10 pointer-events-none">
                  <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin mb-3" />
                  <p className="text-sm font-semibold text-white">Connecting camera...</p>
                </div>
              )}

              {/* Status HUD Over Video */}
              <div className="absolute top-4 inset-x-4 flex justify-between items-center pointer-events-none z-10">
                <div className="bg-slate-950/85 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-slate-800 text-xs font-medium text-slate-200 flex items-center gap-2 shadow-lg">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      detection.state === "capturing"
                        ? "bg-emerald-500 animate-ping"
                        : detection.state === "stabilizing"
                        ? "bg-indigo-500"
                        : detection.state === "detected"
                        ? "bg-sky-400"
                        : "bg-amber-400"
                    }`}
                  />
                  <span>{detection.stateMessage}</span>
                </div>

                {detection.state === "stabilizing" && (
                  <div className="bg-slate-950/85 backdrop-blur-md px-3 py-1 rounded-full border border-indigo-500/40 text-xs font-semibold text-indigo-300 flex items-center gap-1.5 shadow-lg">
                    <span>Hold still</span>
                    <span className="font-mono">{Math.round(detection.stabilityProgress * 100)}%</span>
                  </div>
                )}
              </div>

              {/* Stability Progress Bar across bottom */}
              {detection.state === "stabilizing" && (
                <div className="absolute bottom-0 inset-x-0 h-1.5 bg-slate-800 z-10">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-100"
                    style={{ width: `${detection.stabilityProgress * 100}%` }}
                  />
                </div>
              )}
            </div>

            {/* Manual Controls Toolbar */}
            <div className="mt-5 flex items-center justify-center gap-4 w-full max-w-md">
              <button
                type="button"
                onClick={handleManualCapture}
                className="flex-1 py-3 px-5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm shadow-lg shadow-indigo-600/25 transition-all flex items-center justify-center gap-2 active:scale-95"
              >
                <Camera className="w-4 h-4" />
                <span>Capture Now (Manual)</span>
              </button>

              <button
                type="button"
                onClick={() => startCamera()}
                className="p-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-all"
                title="Restart Camera"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: FLIP CARD PROMPT (Double-Sided Workflow) */}
        {step === "awaiting_back" && frontCapture && (
          <div className="max-w-lg mx-auto bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-center backdrop-blur-xl">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-7 h-7" />
            </div>

            <h2 className="text-xl font-bold text-white mb-2">Front Captured Successfully!</h2>
            <p className="text-sm text-slate-300 mb-6">
              Now flip your physical gift card to scan the <strong className="text-indigo-400">back side</strong>.
            </p>

            {/* Front Preview Thumbnail */}
            <div className="relative aspect-[1.586/1] w-full max-w-xs mx-auto rounded-2xl overflow-hidden border-2 border-slate-700 shadow-lg mb-6">
              <img
                src={frontCapture.processedDataUrl}
                alt="Front Side Preview"
                className="w-full h-full object-cover"
              />
              <div className="absolute top-2 left-2 bg-slate-950/80 px-2 py-0.5 rounded text-[10px] font-semibold text-emerald-300 border border-slate-800">
                Front Side
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleRetake("front")}
                className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs border border-slate-700 transition-all flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retake Front</span>
              </button>

              <button
                type="button"
                onClick={handleStartBackScan}
                className="flex-2 py-3 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2"
              >
                <FlipHorizontal className="w-4 h-4" />
                <span>Flip Card & Scan Back</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 & 4: REVIEW CAPTURED IMAGES (Single or Double) */}
        {(step === "review_front" || step === "review_both") && (
          <div className="max-w-2xl mx-auto bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-white">Review Processed Card</h2>
              <p className="text-xs text-slate-400 mt-1">
                Verify perspective correction, sharpness, and alignment before saving.
              </p>
            </div>

            {/* Side-by-side or Single View */}
            <div className={`grid gap-5 mb-6 ${cardType === "double" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 max-w-md mx-auto"}`}>
              {/* Front Preview */}
              {frontCapture && (
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-300 flex items-center gap-1">
                      <CreditCard className="w-3.5 h-3.5 text-indigo-400" />
                      Front Side
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRetake("front")}
                      className="text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Retake
                    </button>
                  </div>

                  <div className="relative aspect-[1.586/1] w-full rounded-2xl overflow-hidden border-2 border-indigo-500/40 shadow-xl bg-slate-950">
                    <img
                      src={frontCapture.processedDataUrl}
                      alt="Processed Front"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-2 right-2 bg-slate-950/80 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-mono text-slate-300 border border-slate-800">
                      {frontCapture.width} &times; {frontCapture.height}
                    </div>
                  </div>
                </div>
              )}

              {/* Back Preview */}
              {cardType === "double" && backCapture && (
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-300 flex items-center gap-1">
                      <CreditCard className="w-3.5 h-3.5 text-violet-400" />
                      Back Side
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRetake("back")}
                      className="text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Retake
                    </button>
                  </div>

                  <div className="relative aspect-[1.586/1] w-full rounded-2xl overflow-hidden border-2 border-violet-500/40 shadow-xl bg-slate-950">
                    <img
                      src={backCapture.processedDataUrl}
                      alt="Processed Back"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-2 right-2 bg-slate-950/80 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-mono text-slate-300 border border-slate-800">
                      {backCapture.width} &times; {backCapture.height}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Upload Error Banner */}
            {uploadError && (
              <div className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleRetake("front")}
                disabled={isUploading}
                className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs border border-slate-700 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retake</span>
              </button>

              <button
                type="button"
                onClick={handleAcceptAndSave}
                disabled={isUploading}
                className="flex-2 py-3.5 px-6 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isUploading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Saving Card Securely...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Accept & Save Gift Card</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: COMPLETED CONFIRMATION */}
        {step === "completed" && completedCard && (
          <div className="max-w-md mx-auto bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-center backdrop-blur-xl">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-8 h-8" />
            </div>

            <h2 className="text-2xl font-bold text-white mb-1">Scan Complete!</h2>
            <p className="text-sm text-slate-400 mb-6">
              Your gift card scan has been perspective-corrected and stored securely.
            </p>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 mb-6">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                Reference Code
              </span>
              <span className="text-2xl font-mono font-bold text-indigo-400 tracking-wider">
                {completedCard.reference_code}
              </span>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={handleScanAnother}
                className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Scan Another Card</span>
              </button>

              <button
                type="button"
                onClick={() => router.push("/")}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-all"
              >
                Finish Session
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Scanner Footer */}
      <footer className="border-t border-slate-800/60 bg-slate-900/40 px-4 py-3 text-center text-xs text-slate-500">
        <span>Powered by OpenCV.js WebAssembly &bull; Client-side Real-time Homography Rectification</span>
      </footer>
    </div>
  );
}
