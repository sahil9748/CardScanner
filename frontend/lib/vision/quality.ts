import { QuadCorners } from "./types";

export interface QualityAssessment {
  isAcceptable: boolean;
  sharpness: number;
  exposure: "underexposed" | "overexposed" | "normal";
  withinBounds: boolean;
  warnings: string[];
}

export function evaluateImageQuality(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  corners: QuadCorners | null
): QualityAssessment {
  const warnings: string[] = [];

  // 1. Boundary check: ensure corners aren't clamped against video margins
  let withinBounds = true;
  if (corners) {
    const marginX = width * 0.02;
    const marginY = height * 0.02;
    const pts = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
    for (const p of pts) {
      if (p.x <= marginX || p.x >= width - marginX || p.y <= marginY || p.y >= height - marginY) {
        withinBounds = false;
        warnings.push("Card is too close to camera edge. Please center the card.");
        break;
      }
    }
  }

  // Sample center area for exposure and sharpness
  const sampleW = Math.min(200, width);
  const sampleH = Math.min(200, height);
  const startX = Math.floor((width - sampleW) / 2);
  const startY = Math.floor((height - sampleH) / 2);

  let sharpness = 0;
  let exposure: "underexposed" | "overexposed" | "normal" = "normal";

  try {
    const imgData = ctx.getImageData(startX, startY, sampleW, sampleH);
    const data = imgData.data;
    let totalLuma = 0;
    let laplacianSum = 0;
    const pixelCount = sampleW * sampleH;

    // Grayscale luminance array
    const gray = new Float32Array(pixelCount);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      gray[j] = luma;
      totalLuma += luma;
    }

    const avgLuma = totalLuma / pixelCount;
    if (avgLuma < 35) {
      exposure = "underexposed";
      warnings.push("Lighting is too dark. Move card into better light.");
    } else if (avgLuma > 235) {
      exposure = "overexposed";
      warnings.push("Too much glare or brightness on card.");
    }

    // High frequency Laplacian sharpness
    let lapCount = 0;
    for (let y = 1; y < sampleH - 1; y++) {
      for (let x = 1; x < sampleW - 1; x++) {
        const idx = y * sampleW + x;
        const center = gray[idx];
        const lap =
          gray[idx - 1] +
          gray[idx + 1] +
          gray[idx - sampleW] +
          gray[idx + sampleW] -
          4 * center;
        laplacianSum += lap * lap;
        lapCount++;
      }
    }
    sharpness = lapCount > 0 ? Math.round((laplacianSum / lapCount) * 10) / 10 : 0;

    if (sharpness < 8.0) {
      warnings.push("Image appears blurry. Hold camera steady.");
    }
  } catch (e) {
    // Canvas cross-origin or read issue fallback
    sharpness = 25.0;
  }

  const isAcceptable = warnings.length === 0;

  return {
    isAcceptable,
    sharpness,
    exposure,
    withinBounds,
    warnings,
  };
}
