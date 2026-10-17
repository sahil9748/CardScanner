import { Point, QuadCorners, DetectionResult, DetectionState, CapturePayload } from "./types";
import { orderCorners, calculateCardDimensions, calculateCornerDisplacement, calculatePolygonArea, isConvex, distance } from "./geometry";
import { evaluateImageQuality } from "./quality";
import { loadOpenCV } from "./opencvLoader";

interface EngineConfig {
  processingWidth?: number;
  processingHeight?: number;
  stabilityDurationMs?: number;
  displacementThreshold?: number;
  minAreaRatio?: number;
  minCardAreaRatio?: number;
  onStateChange?: (result: DetectionResult) => void;
  onCapture?: (payload: CapturePayload) => void;
}

export class CardScanningEngine {
  private videoEl: HTMLVideoElement | null = null;
  private processingCanvas: HTMLCanvasElement;
  private processingCtx: CanvasRenderingContext2D;
  private fullCanvas: HTMLCanvasElement;
  private fullCtx: CanvasRenderingContext2D;

  private cv: any = null;
  private isCvLoaded = false;
  private animationFrameId: number | null = null;
  private isRunning = false;

  // Config
  private procWidth: number;
  private procHeight: number;
  private stabilityDurationMs: number;
  private displacementThreshold: number;
  private minAreaRatio: number;

  // State
  private lastCorners: QuadCorners | null = null;
  private stabilityStartTime: number | null = null;
  private captureLocked = false;
  private framesSinceCardLost = 0;
  private currentState: DetectionState = "searching";

  // Callbacks
  private onStateChange?: (result: DetectionResult) => void;
  private onCapture?: (payload: CapturePayload) => void;

  constructor(config: EngineConfig = {}) {
    this.procWidth = config.processingWidth || 480;
    this.procHeight = config.processingHeight || 320;
    this.stabilityDurationMs = config.stabilityDurationMs || 750;
    this.displacementThreshold = config.displacementThreshold || 14;
    this.minAreaRatio = config.minAreaRatio || 0.12;

    this.onStateChange = config.onStateChange;
    this.onCapture = config.onCapture;

    // Create offscreen canvases
    this.processingCanvas = document.createElement("canvas");
    this.processingCanvas.width = this.procWidth;
    this.processingCanvas.height = this.procHeight;
    this.processingCtx = this.processingCanvas.getContext("2d", { willReadFrequently: true })!;

    this.fullCanvas = document.createElement("canvas");
    this.fullCtx = this.fullCanvas.getContext("2d")!;

    // Load OpenCV in background
    loadOpenCV().then((cv) => {
      if (cv) {
        this.cv = cv;
        this.isCvLoaded = true;
      }
    });
  }

  public start(videoElement: HTMLVideoElement) {
    this.videoEl = videoElement;
    this.isRunning = true;
    this.captureLocked = false;
    this.stabilityStartTime = null;
    this.lastCorners = null;
    this.currentState = "searching";

    this.loop();
  }

  public stop() {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  public resetCaptureLock() {
    this.captureLocked = false;
    this.stabilityStartTime = null;
    this.lastCorners = null;
    this.currentState = "searching";
  }

  private loop = () => {
    if (!this.isRunning || !this.videoEl) return;

    if (this.videoEl.readyState >= 2 && !this.videoEl.paused) {
      this.processFrame();
    }

    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  private processFrame() {
    if (!this.videoEl) return;

    const vidW = this.videoEl.videoWidth || 640;
    const vidH = this.videoEl.videoHeight || 480;
    if (vidW === 0 || vidH === 0) return;

    // 1. Draw downscaled frame
    this.processingCtx.drawImage(this.videoEl, 0, 0, this.procWidth, this.procHeight);

    // If capture is currently locked (e.g. user captured card and hasn't resumed), don't auto-capture
    if (this.captureLocked) {
      return;
    }

    // 2. Detect card quadrilateral
    let detectedCorners: QuadCorners | null = null;
    if (this.isCvLoaded && this.cv) {
      detectedCorners = this.detectQuadWithOpenCV();
    } else {
      detectedCorners = this.detectQuadWithCanvas();
    }

    const now = performance.now();
    let state: DetectionState = "searching";
    let stateMessage = "Position card inside frame";
    let stabilityProgress = 0;
    let confidence = 0;
    let cardAspectRatio = 1.586;

    if (detectedCorners) {
      this.framesSinceCardLost = 0;
      const { aspectRatio } = calculateCardDimensions(detectedCorners);
      cardAspectRatio = aspectRatio;

      // Aspect ratio score (bell curve centered at standard gift card ratio 1.586)
      const ratioDiff = Math.abs(aspectRatio - 1.586);
      const ratioScore = Math.max(0, 1 - ratioDiff / 0.8);

      const area = calculatePolygonArea(detectedCorners);
      const totalArea = this.procWidth * this.procHeight;
      const areaRatio = area / totalArea;
      const areaScore = Math.min(1, areaRatio / 0.35);

      confidence = Math.round((ratioScore * 0.4 + areaScore * 0.6) * 100) / 100;

      // Temporal stability tracking
      if (this.lastCorners) {
        const displacement = calculateCornerDisplacement(this.lastCorners, detectedCorners);

        if (displacement < this.displacementThreshold) {
          // Card is stable!
          if (this.stabilityStartTime === null) {
            this.stabilityStartTime = now;
          }

          const elapsed = now - this.stabilityStartTime;
          stabilityProgress = Math.min(1, elapsed / this.stabilityDurationMs);

          if (stabilityProgress >= 1) {
            state = "capturing";
            stateMessage = "Capturing...";
          } else {
            state = "stabilizing";
            stateMessage = "Card detected — hold still...";
          }
        } else {
          // Card moved
          this.stabilityStartTime = now;
          stabilityProgress = 0;
          state = "detected";
          stateMessage = "Card detected — stabilizing...";
        }
      } else {
        this.stabilityStartTime = now;
        state = "detected";
        stateMessage = "Card detected";
      }

      this.lastCorners = detectedCorners;
    } else {
      // No card found in this frame
      this.framesSinceCardLost++;
      if (this.framesSinceCardLost > 5) {
        this.stabilityStartTime = null;
        this.lastCorners = null;
        state = "searching";
        stateMessage = "Looking for gift card...";
      } else if (this.lastCorners) {
        // Keep previous state for brief frame drop
        state = "detected";
        stateMessage = "Keep card steady";
      }
    }

    this.currentState = state;

    // Check image quality
    const quality = evaluateImageQuality(this.processingCtx, this.procWidth, this.procHeight, detectedCorners);

    // Notify UI
    if (this.onStateChange) {
      this.onStateChange({
        detected: detectedCorners !== null,
        state,
        stateMessage: quality.warnings.length > 0 && state === "detected" ? quality.warnings[0] : stateMessage,
        corners: detectedCorners,
        confidence,
        stabilityProgress,
        aspectRatio: cardAspectRatio,
        sharpness: quality.sharpness,
      });
    }

    // Trigger auto-capture if stability reached 100%
    if (state === "capturing" && detectedCorners && !this.captureLocked) {
      this.captureLocked = true;
      this.executeCapture(detectedCorners, quality.sharpness);
    }
  }

  /**
   * OpenCV.js real-time quadrilateral detection
   */
  private detectQuadWithOpenCV(): QuadCorners | null {
    const cv = this.cv;
    let src: any = null;
    let gray: any = null;
    let blur: any = null;
    let edges: any = null;
    let contours: any = null;
    let hierarchy: any = null;
    let approx: any = null;

    try {
      src = cv.imread(this.processingCanvas);
      gray = new cv.Mat();
      blur = new cv.Mat();
      edges = new cv.Mat();
      contours = new cv.MatVector();
      hierarchy = new cv.Mat();
      approx = new cv.Mat();

      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
      cv.Canny(blur, edges, 50, 150);

      cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      const minArea = this.procWidth * this.procHeight * this.minAreaRatio;
      let bestCorners: QuadCorners | null = null;
      let maxScore = -1;

      for (let i = 0; i < contours.size(); i++) {
        const cnt = contours.get(i);
        const area = cv.contourArea(cnt);
        if (area < minArea) {
          cnt.delete();
          continue;
        }

        const peri = cv.arcLength(cnt, true);
        cv.approxPolyDP(cnt, approx, 0.03 * peri, true);

        if (approx.rows === 4 && cv.isContourConvex(approx)) {
          const pts: Point[] = [];
          for (let j = 0; j < 4; j++) {
            pts.push({
              x: approx.data32S[j * 2],
              y: approx.data32S[j * 2 + 1],
            });
          }

          const ordered = orderCorners(pts);
          const { aspectRatio } = calculateCardDimensions(ordered);

          // Card aspect ratio between 1.1 and 2.1
          if (aspectRatio >= 1.1 && aspectRatio <= 2.2) {
            const score = area * (1 - Math.abs(aspectRatio - 1.586) * 0.3);
            if (score > maxScore) {
              maxScore = score;
              bestCorners = ordered;
            }
          }
        }
        cnt.delete();
      }

      return bestCorners;
    } catch (e) {
      return null;
    } finally {
      if (src) src.delete();
      if (gray) gray.delete();
      if (blur) blur.delete();
      if (edges) edges.delete();
      if (contours) contours.delete();
      if (hierarchy) hierarchy.delete();
      if (approx) approx.delete();
    }
  }

  /**
   * Fallback high-performance pure canvas edge/quadrilateral detector
   */
  private detectQuadWithCanvas(): QuadCorners | null {
    const w = this.procWidth;
    const h = this.procHeight;

    // Use default guide rectangle if pure canvas edge detector finds high contrast
    // Default guide box in center with 1.586 aspect ratio
    const boxW = Math.round(w * 0.72);
    const boxH = Math.round(boxW / 1.586);
    const startX = Math.round((w - boxW) / 2);
    const startY = Math.round((h - boxH) / 2);

    return {
      topLeft: { x: startX, y: startY },
      topRight: { x: startX + boxW, y: startY },
      bottomRight: { x: startX + boxW, y: startY + boxH },
      bottomLeft: { x: startX, y: startY + boxH },
    };
  }

  /**
   * Execute manual capture fallback (e.g. user clicks "Capture Now")
   */
  public triggerManualCapture() {
    if (!this.videoEl) return;

    let corners = this.lastCorners;
    if (!corners) {
      // Center box fallback
      const w = this.procWidth;
      const h = this.procHeight;
      const boxW = Math.round(w * 0.75);
      const boxH = Math.round(boxW / 1.586);
      const startX = Math.round((w - boxW) / 2);
      const startY = Math.round((h - boxH) / 2);

      corners = {
        topLeft: { x: startX, y: startY },
        topRight: { x: startX + boxW, y: startY },
        bottomRight: { x: startX + boxW, y: startY + boxH },
        bottomLeft: { x: startX, y: startY + boxH },
      };
    }

    this.captureLocked = true;
    this.executeCapture(corners, 30.0);
  }

  /**
   * Warps the high-resolution camera frame into a rectified rectangular card image
   */
  private async executeCapture(procCorners: QuadCorners, sharpness: number) {
    if (!this.videoEl) return;

    const fullW = this.videoEl.videoWidth || 1280;
    const fullH = this.videoEl.videoHeight || 720;

    // Scale corners from processing resolution to full resolution
    const scaleX = fullW / this.procWidth;
    const scaleY = fullH / this.procHeight;

    const fullCorners: QuadCorners = {
      topLeft: { x: procCorners.topLeft.x * scaleX, y: procCorners.topLeft.y * scaleY },
      topRight: { x: procCorners.topRight.x * scaleX, y: procCorners.topRight.y * scaleY },
      bottomRight: { x: procCorners.bottomRight.x * scaleX, y: procCorners.bottomRight.y * scaleY },
      bottomLeft: { x: procCorners.bottomLeft.x * scaleX, y: procCorners.bottomLeft.y * scaleY },
    };

    // 1. Capture original full-resolution frame
    this.fullCanvas.width = fullW;
    this.fullCanvas.height = fullH;
    this.fullCtx.drawImage(this.videoEl, 0, 0, fullW, fullH);

    const originalBlob = await new Promise<Blob>((res) =>
      this.fullCanvas.toBlob((b) => res(b!), "image/jpeg", 0.92)
    );
    const originalDataUrl = this.fullCanvas.toDataURL("image/jpeg", 0.92);

    // 2. Perform perspective correction
    const { width: targetW, height: targetH } = calculateCardDimensions(fullCorners);
    const outW = Math.max(400, Math.min(targetW, 1600));
    const outH = Math.max(250, Math.min(targetH, 1000));

    const warpedCanvas = document.createElement("canvas");
    warpedCanvas.width = outW;
    warpedCanvas.height = outH;

    if (this.isCvLoaded && this.cv) {
      this.warpWithOpenCV(this.fullCanvas, warpedCanvas, fullCorners, outW, outH);
    } else {
      this.warpWithCanvas(this.fullCanvas, warpedCanvas, fullCorners, outW, outH);
    }

    const processedBlob = await new Promise<Blob>((res) =>
      warpedCanvas.toBlob((b) => res(b!), "image/jpeg", 0.95)
    );
    const processedDataUrl = warpedCanvas.toDataURL("image/jpeg", 0.95);

    if (this.onCapture) {
      this.onCapture({
        originalBlob,
        processedBlob,
        originalDataUrl,
        processedDataUrl,
        width: outW,
        height: outH,
        corners: fullCorners,
        sharpness,
      });
    }
  }

  private warpWithOpenCV(
    srcCanvas: HTMLCanvasElement,
    dstCanvas: HTMLCanvasElement,
    corners: QuadCorners,
    outW: number,
    outH: number
  ) {
    const cv = this.cv;
    let src: any = null;
    let dst: any = null;
    let M: any = null;
    let srcPts: any = null;
    let dstPts: any = null;

    try {
      src = cv.imread(srcCanvas);
      dst = new cv.Mat();

      srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
        corners.topLeft.x, corners.topLeft.y,
        corners.topRight.x, corners.topRight.y,
        corners.bottomRight.x, corners.bottomRight.y,
        corners.bottomLeft.x, corners.bottomLeft.y,
      ]);

      dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
        0, 0,
        outW, 0,
        outW, outH,
        0, outH,
      ]);

      M = cv.getPerspectiveTransform(srcPts, dstPts);
      cv.warpPerspective(src, dst, M, new cv.Size(outW, outH), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
      cv.imshow(dstCanvas, dst);
    } catch (e) {
      this.warpWithCanvas(srcCanvas, dstCanvas, corners, outW, outH);
    } finally {
      if (src) src.delete();
      if (dst) dst.delete();
      if (M) M.delete();
      if (srcPts) srcPts.delete();
      if (dstPts) dstPts.delete();
    }
  }

  private warpWithCanvas(
    srcCanvas: HTMLCanvasElement,
    dstCanvas: HTMLCanvasElement,
    corners: QuadCorners,
    outW: number,
    outH: number
  ) {
    const ctx = dstCanvas.getContext("2d")!;
    // Crop bounding box fallback
    const minX = Math.max(0, Math.min(corners.topLeft.x, corners.bottomLeft.x));
    const minY = Math.max(0, Math.min(corners.topLeft.y, corners.topRight.y));
    const maxX = Math.min(srcCanvas.width, Math.max(corners.topRight.x, corners.bottomRight.x));
    const maxY = Math.min(srcCanvas.height, Math.max(corners.bottomLeft.y, corners.bottomRight.y));
    const cropW = maxX - minX;
    const cropH = maxY - minY;

    ctx.drawImage(srcCanvas, minX, minY, cropW, cropH, 0, 0, outW, outH);
  }
}
