import { describe, it, expect } from "vitest";
import { orderCorners, calculateCardDimensions, isConvex, calculatePolygonArea, distance } from "../lib/vision/geometry";
import { Point } from "../lib/vision/types";

describe("Computer Vision Geometry Utilities", () => {
  it("calculates Euclidean distance between two points accurately", () => {
    const p1: Point = { x: 0, y: 0 };
    const p2: Point = { x: 3, y: 4 };
    expect(distance(p1, p2)).toBe(5);
  });

  it("consistently orders shuffled quadrilateral corners into TL, TR, BR, BL", () => {
    // Unordered points of a rectangle
    const rawPoints: Point[] = [
      { x: 500, y: 300 }, // BR
      { x: 100, y: 100 }, // TL
      { x: 500, y: 100 }, // TR
      { x: 100, y: 300 }, // BL
    ];

    const ordered = orderCorners(rawPoints);
    expect(ordered.topLeft).toEqual({ x: 100, y: 100 });
    expect(ordered.topRight).toEqual({ x: 500, y: 100 });
    expect(ordered.bottomRight).toEqual({ x: 500, y: 300 });
    expect(ordered.bottomLeft).toEqual({ x: 100, y: 300 });
  });

  it("calculates aspect ratio close to standard gift card (1.586:1)", () => {
    // Standard ID-1 card dimensions: ~85.6mm x 53.98mm = 1.5857:1
    const cardCorners = {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 856, y: 0 },
      bottomRight: { x: 856, y: 540 },
      bottomLeft: { x: 0, y: 540 },
    };

    const { width, height, aspectRatio } = calculateCardDimensions(cardCorners);
    expect(width).toBe(856);
    expect(height).toBe(540);
    expect(aspectRatio).toBeCloseTo(1.585, 2);
  });

  it("correctly identifies convex vs non-convex polygons", () => {
    const convexCard = {
      topLeft: { x: 100, y: 100 },
      topRight: { x: 400, y: 110 },
      bottomRight: { x: 390, y: 300 },
      bottomLeft: { x: 110, y: 290 },
    };
    expect(isConvex(convexCard)).toBe(true);

    // Concave / Self-intersecting polygon
    const concavePolygon = {
      topLeft: { x: 100, y: 100 },
      topRight: { x: 400, y: 100 },
      bottomRight: { x: 150, y: 150 }, // dented inwards
      bottomLeft: { x: 100, y: 300 },
    };
    expect(isConvex(concavePolygon)).toBe(false);
  });

  it("calculates correct polygon area", () => {
    const rect = {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 200, y: 0 },
      bottomRight: { x: 200, y: 100 },
      bottomLeft: { x: 0, y: 100 },
    };
    expect(calculatePolygonArea(rect)).toBe(20000);
  });
});
