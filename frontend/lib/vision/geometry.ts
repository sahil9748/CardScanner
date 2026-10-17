import { Point, QuadCorners } from "./types";

export function distance(p1: Point, p2: Point): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function orderCorners(pts: Point[]): QuadCorners {
  if (pts.length !== 4) {
    throw new Error("Exactly 4 points required to order quadrilateral corners");
  }

  // 1. Sort by y-coordinate to separate top two and bottom two
  const sortedByY = [...pts].sort((a, b) => a.y - b.y);
  const topPoints = sortedByY.slice(0, 2);
  const bottomPoints = sortedByY.slice(2, 4);

  // 2. Sort top points by x-coordinate: leftmost is Top-Left, rightmost is Top-Right
  topPoints.sort((a, b) => a.x - b.x);
  const topLeft = topPoints[0];
  const topRight = topPoints[1];

  // 3. Sort bottom points by x-coordinate: leftmost is Bottom-Left, rightmost is Bottom-Right
  bottomPoints.sort((a, b) => a.x - b.x);
  const bottomLeft = bottomPoints[0];
  const bottomRight = bottomPoints[1];

  return {
    topLeft,
    topRight,
    bottomRight,
    bottomLeft,
  };
}

export function calculateCardDimensions(corners: QuadCorners): { width: number; height: number; aspectRatio: number } {
  const { topLeft, topRight, bottomRight, bottomLeft } = corners;

  const widthTop = distance(topLeft, topRight);
  const widthBottom = distance(bottomLeft, bottomRight);
  const width = Math.round(Math.max(widthTop, widthBottom));

  const heightLeft = distance(topLeft, bottomLeft);
  const heightRight = distance(topRight, bottomRight);
  const height = Math.round(Math.max(heightLeft, heightRight));

  // Determine orientation (landscape vs portrait)
  const longer = Math.max(width, height);
  const shorter = Math.min(width, height);
  const aspectRatio = shorter > 0 ? longer / shorter : 1;

  return { width, height, aspectRatio };
}

export function calculateCornerDisplacement(c1: QuadCorners, c2: QuadCorners): number {
  const d1 = distance(c1.topLeft, c2.topLeft);
  const d2 = distance(c1.topRight, c2.topRight);
  const d3 = distance(c1.bottomRight, c2.bottomRight);
  const d4 = distance(c1.bottomLeft, c2.bottomLeft);
  return (d1 + d2 + d3 + d4) / 4;
}

export function calculatePolygonArea(corners: QuadCorners): number {
  const pts = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2;
}

export function isConvex(corners: QuadCorners): boolean {
  const pts = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % 4];
    const p3 = pts[(i + 2) % 4];
    const cross = (p2.x - p1.x) * (p3.y - p2.y) - (p2.y - p1.y) * (p3.x - p2.x);
    if (cross !== 0) {
      if (sign === 0) {
        sign = cross > 0 ? 1 : -1;
      } else if ((cross > 0 ? 1 : -1) !== sign) {
        return false;
      }
    }
  }
  return true;
}
