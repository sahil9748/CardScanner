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
  const [error, setError] = useState<string | null>(null);
  const [isPermissionDenied, setIsPermissionDenied] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isStartingRef = useRef<boolean>(false);

  // Keep streamRef in sync with stream state
  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);

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
  }, []);

  // Enumerate cameras
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
      if (videoDevices.length > 0 && !selectedDeviceId) {
        // Prefer back camera if found on mobile
        const backCam = videoDevices.find((d) => {
          const l = d.label.toLowerCase();
          return l.includes("back") || l.includes("environment") || l.includes("rear");
        });
        setSelectedDeviceId(backCam ? backCam.deviceId : videoDevices[0].deviceId);
      }
    } catch (e) {
      console.warn("Could not enumerate camera devices:", e);
    }
  }, [selectedDeviceId]);

  // Start camera stream (Safe for iOS Safari and mobile WebKit)
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

    // Stop existing stream tracks first
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch (_) {}
      });
      streamRef.current = null;
    }

    const deviceId = preferredDeviceId || selectedDeviceId;

    // Use ideal dimensions without min bounds for mobile compatibility
    const constraints: MediaStreamConstraints = {
      audio: false,
      video: deviceId
        ? {
            deviceId: { exact: deviceId },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          }
        : {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
    };

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = mediaStream;
      setStream(mediaStream);

      // Safe video attachment for iOS Safari
      const video = videoRef.current;
      if (video) {
        video.srcObject = mediaStream;
        const playSafe = () => {
          video.play().catch((playErr) => {
            if (playErr.name !== "AbortError") {
              console.warn("Autoplay notice:", playErr);
            }
          });
        };

        if (video.readyState >= 1) {
          playSafe();
        } else {
          video.addEventListener("loadedmetadata", playSafe, { once: true });
        }
      }

      await refreshDevices();
    } catch (err: any) {
      console.error("Camera access error:", err);
      // Ignore AbortError if stream was actually obtained or cancelled by quick re-render
      if (err.name === "AbortError" && streamRef.current) {
        return;
      }

      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setIsPermissionDenied(true);
        setError("Camera permission was denied. Please allow camera access in your browser settings to scan cards.");
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setError("No camera device found on this system.");
      } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        setError("Camera is currently in use by another application. Please close other camera apps and retry.");
      } else if (err.name === "AbortError") {
        // Retry once on mobile WebKit abort
        console.warn("Retrying camera initialization after WebKit abort...");
        setTimeout(() => {
          isStartingRef.current = false;
          startCamera(preferredDeviceId);
        }, 300);
        return;
      } else {
        setError(err.message || "Failed to start camera. Please ensure HTTPS is used.");
      }
    } finally {
      setIsLoading(false);
      isStartingRef.current = false;
    }
  }, [selectedDeviceId, refreshDevices]);

  // Synchronize stream with video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;

    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }

    const handlePlay = () => {
      video.play().catch((err) => {
        if (err.name !== "AbortError") {
          console.warn("Video play error:", err);
        }
      });
    };

    if (video.readyState >= 1) {
      handlePlay();
    } else {
      video.addEventListener("loadedmetadata", handlePlay, { once: true });
    }
  }, [stream]);

  // Cleanup on unmount
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
    isLoading,
    error,
    isPermissionDenied,
    startCamera,
    stopStream,
  };
}
