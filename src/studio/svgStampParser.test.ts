import { describe, expect, it } from 'vitest';
import {
  mapNormalizedPathsToMm,
  normalizeSvgPathD,
  parseSvgStampText,
} from './svgStampParser';

describe('svgStampParser', () => {
  it('normalizes relative commands, H/V shortcuts, smooth curves, and arcs into pure absolute M/L/Q/C/Z', () => {
    const normalized = normalizeSvgPathD('M 10 20 h 30 v 10 l -10 5 a 10 10 0 0 1 20 0 z', 10, 20);
    expect(normalized).toContain('M 0 0');
    expect(normalized).toContain('L 30 0');
    expect(normalized).toContain('L 30 10');
    expect(normalized).toContain('C ');
    expect(normalized).toContain('Z');
    expect(normalized).not.toMatch(/[a-z]/);
  });

  it('parses SVG primitives (path, circle, rect, polygon, line), skips defs, and maps cleanly to 1:1 mm', () => {
    const sampleSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <defs><rect x="0" y="0" width="100" height="100" /></defs>
        <circle cx="50" cy="50" r="30" fill="#000" />
        <polygon points="50,10 60,40 40,40" fill="#000" />
      </svg>
    `;
    const parsed = parseSvgStampText(sampleSvg);
    expect(parsed).not.toBeNull();
    expect(parsed!.viewBoxWidth).toBe(100);
    expect(parsed!.viewBoxHeight).toBe(100);
    expect(parsed!.paths).toHaveLength(2);
    expect(parsed!.suggestedMode).toBe('fill');

    const mapped = mapNormalizedPathsToMm(
      parsed!.paths,
      parsed!.viewBoxWidth,
      parsed!.viewBoxHeight,
      { xMm: 20, yMm: 30, widthMm: 50, heightMm: 50 },
    );
    expect(mapped).toHaveLength(2);
    expect(mapped[1]).toBe('M 45 35 L 50 50 L 40 50 Z');

    // Mirrored mapping for HTV iron-on
    const mirrored = mapNormalizedPathsToMm(
      parsed!.paths,
      parsed!.viewBoxWidth,
      parsed!.viewBoxHeight,
      { xMm: 20, yMm: 30, widthMm: 50, heightMm: 50 },
      { originXMm: 0, originYMm: 0, canvasWidthMm: 100, mirrorX: true },
    );
    expect(mirrored[1]).toBe('M 55 35 L 50 50 L 60 50 Z');

    // Local flipX / flipY baked into mm coordinates
    const flipped = mapNormalizedPathsToMm(
      ['M 10 20 L 30 80 Z'],
      100,
      100,
      { xMm: 0, yMm: 0, widthMm: 100, heightMm: 100 },
      { flipX: true, flipY: true },
    );
    expect(flipped[0]).toBe('M 90 80 L 70 20 Z');
  });

  it('detects stroke-only line-art SVGs automatically', () => {
    const lineSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60">
        <path d="M 5 30 L 55 30" fill="none" stroke="#111" stroke-width="2" />
      </svg>
    `;
    const parsed = parseSvgStampText(lineSvg);
    expect(parsed?.suggestedMode).toBe('stroke');
  });
});
