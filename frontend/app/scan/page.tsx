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
  FlipHorizontal,
  Play,
} from "lucide-react";
import confetti from "canvas-confetti";
import { useCamera } from "@/hooks/useCamera";
import { CapturePayload } from "@/lib/vision/types";
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
    startCamera,
    resumeVideo,
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

  // Shutter and capture state
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [isShutterActive, setIsShutterActive] = useState<boolean>(false);

  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [completedCard, setCompletedCard] = useState<any>(null);

  // Hidden offscreen canvases for instant snapshot extraction
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);

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

  // Execute manual photo capture from high-res video stream
  const captureSnapshot = useCallback(async (): Promise<CapturePayload | null> => {
    const video = videoRef.current;
    if (!video) return null;

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      try {
        await video.play();
      } catch (_) {}
    }

    const fullW = video.videoWidth || 1280;
    const fullH = video.videoHeight || 720;
    if (fullW === 0 || fullH === 0) return null;

    // Trigger visual shutter flash
    setIsShutterActive(true);
    setTimeout(() => setIsShutterActive(false), 220);

    // 1. Draw full high-resolution camera frame
    const fullCanvas = document.createElement("canvas");
    fullCanvas.width = fullW;
    fullCanvas.height = fullH;
    const fullCtx = fullCanvas.getContext("2d");
    if (!fullCtx) return null;

    fullCtx.drawImage(video, 0, 0, fullW, fullH);

    const originalBlob = await new Promise<Blob>((res) =>
      fullCanvas.toBlob((b) => res(b!), "image/jpeg", 0.92)
    );
    const originalDataUrl = fullCanvas.toDataURL("image/jpeg", 0.92);

    // 2. Extract aligned Guide Box Crop for instant client preview
    const targetAspect = 1.586; // Standard gift card ratio
    let guideW = Math.round(fullW * 0.78);
    let guideH = Math.round(guideW / targetAspect);
    if (guideH > fullH * 0.88) {
      guideH = Math.round(fullH * 0.85);
      guideW = Math.round(guideH * targetAspect);
    }

    const cropX = Math.max(0, Math.round((fullW - guideW) / 2));
    const cropY = Math.max(0, Math.round((fullH - guideH) / 2));

    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = guideW;
    cropCanvas.height = guideH;
    const cropCtx = cropCanvas.getContext("2d");
    if (cropCtx) {
      cropCtx.drawImage(fullCanvas, cropX, cropY, guideW, guideH, 0, 0, guideW, guideH);
    }

    const processedBlob = await new Promise<Blob>((res) =>
      cropCanvas.toBlob((b) => res(b!), "image/jpeg", 0.95)
    );
    const processedDataUrl = cropCanvas.toDataURL("image/jpeg", 0.95);

    return {
      originalBlob,
      processedBlob,
      originalDataUrl,
      processedDataUrl,
      width: guideW,
      height: guideH,
      corners: {
        topLeft: { x: cropX, y: cropY },
        topRight: { x: cropX + guideW, y: cropY },
        bottomRight: { x: cropX + guideW, y: cropY + guideH },
        bottomLeft: { x: cropX, y: cropY + guideH },
      },
      sharpness: 35.0,
    };
  }, [videoRef]);

  // Handle Capture button click
  const handleCapture = async () => {
    if (isCapturing) return;
    setIsCapturing(true);

    try {
      const payload = await captureSnapshot();
      if (!payload) {
        setIsCapturing(false);
        return;
      }

      if (step === "scanning_front") {
        setFrontCapture(payload);
        if (cardType === "single") {
          setStep("review_front");
        } else {
          setStep("awaiting_back");
        }
      } else if (step === "scanning_back") {
        setBackCapture(payload);
        setStep("review_both");
      }
    } catch (e) {
      console.error("Capture failed:", e);
    } finally {
      setIsCapturing(false);
    }
  };

  // Switch card type
  const handleCardTypeChange = async (newType: "single" | "double") => {
    if (newType === cardType) return;
    try {
      await api.updateCardType(newType);
      setCardType(newType);
      setStep("scanning_front");
      setFrontCapture(null);
      setBackCapture(null);
      resumeVideo();
    } catch (e) {
      console.error(e);
    }
  };

  // Retake side - guarantees instant wake and feed continuity
  const handleRetake = (side: "front" | "back") => {
    if (side === "front") {
      setFrontCapture(null);
      setStep("scanning_front");
    } else {
      setBackCapture(null);
      setStep("scanning_back");
    }
    resumeVideo();
  };

  // Start back scanning after card flip
  const handleStartBackScan = () => {
    setStep("scanning_back");
    resumeVideo();
  };

  // Save and Complete Scan
  const handleAcceptAndSave = async () => {
    if (!session || !frontCapture) return;
    if (cardType === "double" && !backCapture) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      // 1. Upload Front Image (Server will automatically auto-crop and rectify)
      const uploadRes = await api.uploadSessionImage(session.id, "front", frontCapture.originalBlob, frontCapture.processedBlob);
      const activeSessionId = uploadRes?.session_id || session.id;

      // 2. Upload Back Image (if double-sided)
      if (cardType === "double" && backCapture) {
        await api.uploadSessionImage(activeSessionId, "back", backCapture.originalBlob, backCapture.processedBlob);
      }

      // 3. Complete Session
      const completed = await api.completeSession(activeSessionId);
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
  const handleScanAnother = async () => {
    setFrontCapture(null);
    setBackCapture(null);
    setCompletedCard(null);
    setUploadError(null);
    setStep("scanning_front");
    resumeVideo();

    try {
      const nextSession = await api.startNextSession();
      setSession(nextSession);
    } catch (_) {
      try {
        const curSession = await api.getCurrentSession();
        setSession(curSession);
      } catch (err) {
        router.push("/");
      }
    }
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

  const isScanning = (step === "scanning_front" || step === "scanning_back") && !cameraError;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between select-none">
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

        {/* Card Type Toggle */}
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
              className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-all shadow-md active:scale-95"
            >
              Retry Camera Permission
            </button>
          </div>
        )}

        {/* STEP 1 & 3: LIVE CAMERA VIEWPORT (KEPT MOUNTED TO PRESERVE STREAM CONTINUITY) */}
        <div className={`flex flex-col items-center w-full ${isScanning ? "block" : "hidden"}`}>
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

          {/* Video Viewport with Card Alignment Guide Frame */}
          <div
            onClick={resumeVideo}
            className="relative w-full max-w-2xl aspect-[4/3] sm:aspect-[16/10] rounded-3xl overflow-hidden bg-slate-900 border-2 border-slate-800 shadow-2xl flex items-center justify-center cursor-pointer"
          >
            <video
              ref={(el) => {
                videoRef.current = el;
                if (el && stream) {
                  el.muted = true;
                  el.defaultMuted = true;
                  el.playsInline = true;
                  el.setAttribute("playsinline", "true");
                  el.setAttribute("webkit-playsinline", "true");
                  el.setAttribute("muted", "true");
                  el.setAttribute("autoplay", "true");
                  if (el.srcObject !== stream) {
                    el.srcObject = stream;
                  }
                  el.play().catch(() => {});
                }
              }}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />

            {/* Visual Alignment Reticle Overlay */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              {/* Outer Dimming Vignette */}
              <div className="absolute inset-0 bg-slate-950/30" />

              {/* Centered Card Guide Frame (1.586 Standard Ratio) */}
              <div className="relative w-[78%] aspect-[1.586/1] rounded-2xl border-2 border-indigo-400/50 shadow-2xl z-10 flex items-center justify-center">
                {/* Target Corner Brackets */}
                <span className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-indigo-400 rounded-tl-xl" />
                <span className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-indigo-400 rounded-tr-xl" />
                <span className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-indigo-400 rounded-bl-xl" />
                <span className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-indigo-400 rounded-br-xl" />

                {/* Subtitle helper inside frame */}
                <div className="bg-slate-950/60 backdrop-blur-sm px-3 py-1 rounded-full text-[11px] font-medium text-slate-300 border border-slate-700/60">
                  Align card within frame
                </div>
              </div>
            </div>

            {/* Shutter White Flash Effect */}
            {isShutterActive && (
              <div className="absolute inset-0 bg-white pointer-events-none transition-opacity duration-200 z-30 opacity-80" />
            )}

            {/* iOS Touch-to-Play Overlay (Appears if Safari holds video paused) */}
            {stream && !isPlaying && !isCameraLoading && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  resumeVideo();
                }}
                className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-20"
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
              <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-20 pointer-events-none">
                <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin mb-3" />
                <p className="text-sm font-semibold text-white">Connecting camera...</p>
              </div>
            )}
          </div>

          {/* Shutter Controls Toolbar */}
          <div className="mt-5 flex items-center justify-center gap-4 w-full max-w-md">
            <button
              type="button"
              onClick={handleCapture}
              disabled={isCapturing}
              className="flex-1 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-70 text-white font-bold text-sm shadow-xl shadow-indigo-600/30 transition-all flex items-center justify-center gap-2.5 active:scale-95"
            >
              {isCapturing ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>Capturing...</span>
                </>
              ) : (
                <>
                  <Camera className="w-5 h-5" />
                  <span>Capture Card Now</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => startCamera()}
              className="p-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-all active:scale-95"
              title="Restart Camera"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

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
                className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs border border-slate-700 transition-all flex items-center justify-center gap-1.5 active:scale-95"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retake Front</span>
              </button>

              <button
                type="button"
                onClick={handleStartBackScan}
                className="flex-2 py-3 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 active:scale-95"
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
                Verify sharpness and alignment before saving. Auto-cropping will rectify card edges on save.
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
                className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs border border-slate-700 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retake</span>
              </button>

              <button
                type="button"
                onClick={handleAcceptAndSave}
                disabled={isUploading}
                className="flex-2 py-3.5 px-6 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95"
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
                className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Scan Another Card</span>
              </button>

              <button
                type="button"
                onClick={() => router.push("/")}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-all active:scale-95"
              >
                Finish Session
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Scanner Footer */}
      <footer className="border-t border-slate-800/60 bg-slate-900/40 px-4 py-3 text-center text-xs text-slate-500">
        <span>Instant High-Resolution Card Capture &bull; Server-Side Automated Homography & Rectification</span>
      </footer>
    </div>
  );
}
