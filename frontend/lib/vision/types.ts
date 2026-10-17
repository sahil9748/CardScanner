export interface Point {
  x: number;
  y: number;
}

export interface QuadCorners {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
}

export type DetectionState =
  | "searching"        // Looking for card
  | "detected"         // Card candidate found
  | "stabilizing"      // Card detected, holding still
  | "capturing"        // Capture threshold reached
  | "captured"         // Capture locked, waiting for processing
  | "processing";      // Warping and validating

export interface DetectionResult {
  detected: boolean;
  state: DetectionState;
  stateMessage: string;
  corners: QuadCorners | null;
  confidence: number;       // 0 to 1
  stabilityProgress: number; // 0 to 1 (progress towards auto-capture)
  aspectRatio: number;
  sharpness: number;
}

export interface CapturePayload {
  originalBlob: Blob;
  processedBlob: Blob;
  originalDataUrl: string;
  processedDataUrl: string;
  width: number;
  height: number;
  corners: QuadCorners;
  sharpness: number;
}
