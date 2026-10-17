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

      // Only set initial selectedDeviceId display value if empty, without restarting stream
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

  // Start camera stream - 100% STABLE identity, safe for iOS WebKit & Android
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

    const deviceId = preferredDeviceId || selectedDeviceIdRef.current;

    // Use ideal constraints (never 'exact' on iOS Safari to prevent OverconstrainedError)
    const constraints: MediaStreamConstraints = {
      audio: false,
      video: deviceId
        ? {
            deviceId: { ideal: deviceId },
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

      // Attach and play safely on video element
      const video = videoRef.current;
      if (video) {
        video.srcObject = mediaStream;
        video.setAttribute("playsinline", "true");
        video.setAttribute("webkit-playsinline", "true");

        const tryPlay = () => {
          video.play().catch((playErr) => {
            if (playErr.name !== "AbortError") {
              console.warn("Video play notice:", playErr);
            }
          });
        };

        if (video.readyState >= 2) {
          tryPlay();
        } else {
          video.onloadedmetadata = () => {
            tryPlay();
          };
        }
      }

      await refreshDevices();
    } catch (err: any) {
      console.error("Camera access error:", err);

      // Benign AbortError on mobile during render cycle - ignore if stream exists
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
        console.warn("Retrying camera once after WebKit abort...");
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
  }, [refreshDevices]);

  // Keep video ref updated when stream changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;

    if (video.srcObject !== stream) {
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      video.setAttribute("webkit-playsinline", "true");
    }

    const playSafe = () => {
      video.play().catch((err) => {
        if (err.name !== "AbortError") {
          console.warn("Autoplay notice:", err);
        }
      });
    };

    if (video.readyState >= 2) {
      playSafe();
    } else {
      video.onloadedmetadata = () => {
        playSafe();
      };
    }
  }, [stream]);

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
    isLoading,
    error,
    isPermissionDenied,
    startCamera,
    stopStream,
  };
}
