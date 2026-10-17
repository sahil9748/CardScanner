"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export interface CameraDevice {
  deviceId: string;
  label: string;
}

export function useCamera() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isPermissionDenied, setIsPermissionDenied] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const selectedDeviceIdRef = useRef<string>("");
  const isStartingRef = useRef<boolean>(false);

  // Sync selectedDeviceIdRef with state
  useEffect(() => {
    selectedDeviceIdRef.current = selectedDeviceId;
  }, [selectedDeviceId]);

  // Clean track shutdown
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (_) {}
      });
      streamRef.current = null;
    }
    setStream(null);
    setIsPlaying(false);
  }, []);

  // Enumerate cameras without auto-switching active stream
  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices
        .filter((d) => d.kind === "videoinput")
        .map((d, index) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${index + 1}`,
        }));
      setDevices(videoDevices);

      // Only set initial selectedDeviceId display value if empty
      if (videoDevices.length > 0 && !selectedDeviceIdRef.current) {
        const backCam = videoDevices.find((d) => {
          const l = d.label.toLowerCase();
          return l.includes("back") || l.includes("environment") || l.includes("rear") || l.includes("triple");
        });
        const chosenId = backCam ? backCam.deviceId : videoDevices[0].deviceId;
        selectedDeviceIdRef.current = chosenId;
        setSelectedDeviceId(chosenId);
      }
    } catch (e) {
      console.warn("Could not enumerate camera devices:", e);
    }
  }, []);

  // Configure video element for iOS Safari WebKit inline playback
  const configureVideoElement = useCallback((video: HTMLVideoElement, mediaStream: MediaStream) => {
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.setAttribute("muted", "true");
    video.setAttribute("autoplay", "true");

    if (video.srcObject !== mediaStream) {
      video.srcObject = mediaStream;
    }

    const tryPlay = () => {
      video.muted = true;
      video.playsInline = true;
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
            setIsLoading(false);
          })
          .catch((playErr) => {
            if (playErr.name !== "AbortError") {
              console.warn("Video play notice:", playErr);
            }
          });
      }
    };

    tryPlay();

    const handleLoadedMetadata = () => tryPlay();
    const handleCanPlay = () => tryPlay();
    const handlePlaying = () => {
      setIsPlaying(true);
      setIsLoading(false);
    };
    const handlePause = () => setIsPlaying(false);

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("pause", handlePause);

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("pause", handlePause);
    };
  }, []);

  // Manual resume function for user touch gesture fallback
  const resumeVideo = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      video.muted = true;
      video.playsInline = true;
      await video.play();
      setIsPlaying(true);
      setIsLoading(false);
    } catch (e) {
      console.warn("Manual video play attempt:", e);
    }
  }, []);

  // Start camera stream - clean constraints without restrictive max-dimensions for iOS WebKit
  const startCamera = useCallback(async (preferredDeviceId?: string) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera API is not supported in this browser. HTTPS may be required.");
      return;
    }

    if (isStartingRef.current) {
      return;
    }

    isStartingRef.current = true;
    setIsLoading(true);
    setError(null);
    setIsPermissionDenied(false);

    // Stop existing stream first if switching devices
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch (_) {}
      });
      streamRef.current = null;
    }

    const targetDeviceId = preferredDeviceId || selectedDeviceIdRef.current;

    let mediaStream: MediaStream | null = null;
    try {
      // Primary constraint: ideal environment facing mode (no rigid height max that rejects portrait on iOS)
      const primaryConstraints: MediaStreamConstraints = {
        audio: false,
        video: targetDeviceId
          ? { deviceId: { ideal: targetDeviceId } }
          : { facingMode: { ideal: "environment" } },
      };
      mediaStream = await navigator.mediaDevices.getUserMedia(primaryConstraints);
    } catch (primaryErr: any) {
      console.warn("Primary camera constraints failed, attempting fallback:", primaryErr);
      try {
        // Universal fallback constraint for any available video device
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: true,
        });
      } catch (fallbackErr: any) {
        console.error("All camera constraints failed:", fallbackErr);

        if (fallbackErr.name === "NotAllowedError" || fallbackErr.name === "PermissionDeniedError") {
          setIsPermissionDenied(true);
          setError("Camera permission was denied. Please allow camera access in your browser settings to scan cards.");
        } else if (fallbackErr.name === "NotFoundError" || fallbackErr.name === "DevicesNotFoundError") {
          setError("No camera device found on this system.");
        } else if (fallbackErr.name === "NotReadableError" || fallbackErr.name === "TrackStartError") {
          setError("Camera is currently in use by another application. Please close other camera apps and retry.");
        } else {
          setError(fallbackErr.message || "Failed to start camera. Please ensure HTTPS is used.");
        }
        setIsLoading(false);
        isStartingRef.current = false;
        return;
      }
    }

    try {
      streamRef.current = mediaStream;
      setStream(mediaStream);

      // Attach immediately to video element
      const video = videoRef.current;
      if (video) {
        configureVideoElement(video, mediaStream);
      }

      await refreshDevices();
    } finally {
      setIsLoading(false);
      isStartingRef.current = false;
    }
  }, [refreshDevices, configureVideoElement]);

  // Select a new device and restart camera
  const selectDevice = useCallback(async (newDeviceId: string) => {
    setSelectedDeviceId(newDeviceId);
    selectedDeviceIdRef.current = newDeviceId;
    await startCamera(newDeviceId);
  }, [startCamera]);

  // Keep video ref updated whenever stream or video element becomes available
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;

    const cleanup = configureVideoElement(video, stream);
    return cleanup;
  }, [stream, configureVideoElement]);

  // Clean cleanup on component unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch (_) {}
        });
      }
    };
  }, []);

  return {
    videoRef,
    stream,
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    selectDevice,
    isLoading,
    isPlaying,
    error,
    isPermissionDenied,
    startCamera,
    resumeVideo,
    stopStream,
  };
}
