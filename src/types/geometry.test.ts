import { describe, expect, it } from 'vitest';
import { GeometryPrimitives, STANDARD_ROLL_WIDTHS } from './geometry';

describe('GeometryPrimitives', () => {
  it('computes rectangle right, bottom, and center', () => {
    const rect = { x: 10, y: 20, width: 100, height: 50 };
    expect(GeometryPrimitives.rectRight(rect)).toBe(110);
    expect(GeometryPrimitives.rectBottom(rect)).toBe(70);
    expect(GeometryPrimitives.rectCenter(rect)).toEqual({ x: 60, y: 45 });
  });

  it('translates and rotates points and polygons', () => {
    const poly = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 20 },
    ];
    expect(GeometryPrimitives.translatePoint({ x: 2, y: 3 }, 5, -1)).toEqual({ x: 7, y: 2 });
    expect(GeometryPrimitives.translatePolygon(poly, 5, 10)).toEqual([
      { x: 5, y: 10 },
      { x: 15, y: 10 },
      { x: 15, y: 30 },
    ]);
    expect(GeometryPrimitives.rotatePoint90CW({ x: 10, y: 0 }, 20)).toEqual({ x: 20, y: 10 });
  });

  it('formats polygons to SVG points, paths, and bounding boxes', () => {
    const poly = [
      { x: 1.23456, y: 2 },
      { x: 10, y: 2 },
      { x: 10, y: 12 },
    ];
    expect(GeometryPrimitives.polygonToSvgPoints(poly, 2)).toBe('1.23,2 10,2 10,12');
    expect(GeometryPrimitives.polygonToSvgPath(poly, 1)).toBe('M 1.2 2 L 10 2 L 10 12 Z');
    expect(GeometryPrimitives.polygonToSvgPath([])).toBe('');
    expect(GeometryPrimitives.boundingBox(poly)).toEqual({
      x: 1.23456,
      y: 2,
      width: 10 - 1.23456,
      height: 10,
    });
    expect(GeometryPrimitives.boundingBox([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('exposes the five spec-defined standard roll widths in ascending order', () => {
    expect(STANDARD_ROLL_WIDTHS.map((r) => r.inches)).toEqual([13, 17, 24, 36, 44]);
  });
});
