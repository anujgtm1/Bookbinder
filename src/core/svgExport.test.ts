import { describe, expect, it } from 'vitest';
import { DEFAULT_BOOK_PARAMETERS } from '@/types/bookParams';
import { calculateCaseGeometry } from './geometry';
import { generateInnerTemplatesSvg, generateOuterWrapSvg } from './svgExport';

describe('generateOuterWrapSvg', () => {
  it('generates 1:1 physical mm single-piece SVG with bleed and named Affinity layers', () => {
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const svg = generateOuterWrapSvg(geom, 'single');

    // Default WRAP_W = 366, WRAP_H = 259, bleed = 3 => 372mm x 265mm
    expect(svg).toContain('width="372mm"');
    expect(svg).toContain('height="265mm"');
    expect(svg).toContain('viewBox="-3 -3 372 265"');
    expect(svg).toContain('<g id="bleed-box"');
    expect(svg).toContain('<g id="cut-lines"');
    expect(svg).toContain('<g id="board-guides"');
    expect(svg).toContain('<g id="dimensions-notes"');
    expect(svg).toContain('stroke="#FF0000"');
    expect(svg).toContain('stroke="#0066FF"');
    expect(svg).toContain('stroke="#00AA44"');
    expect(svg).toContain('HINGE 9 mm');
  });

  it('uses exact WRAP_W × WRAP_H dimensions when bleed is disabled', () => {
    const geom = calculateCaseGeometry({ ...DEFAULT_BOOK_PARAMETERS, includeBleed: false });
    const svg = generateOuterWrapSvg(geom, 'single');

    expect(svg).toContain('width="366mm"');
    expect(svg).toContain('height="259mm"');
    expect(svg).toContain('viewBox="0 0 366 259"');
    expect(svg).toContain('<g id="bleed-box" />');
  });

  it('generates 3-piece quarter-bound SVG containing all three panels', () => {
    const geom = calculateCaseGeometry({ ...DEFAULT_BOOK_PARAMETERS, splitMode: 'three-piece' });
    const svg = generateOuterWrapSvg(geom, 'three-piece');

    expect(svg).toContain('3-Piece Quarter-Bound Split');
    expect(svg).toContain('data-label="Back Cover Panel"');
    expect(svg).toContain('data-label="Spine Wrap (Quarter-Bound)"');
    expect(svg).toContain('data-label="Front Cover Panel"');
    expect(svg).toContain('<g id="cut-lines"');
    expect(svg).toContain('<g id="board-guides"');
  });

  it('generates 1:1 physical mm Inner Pockets & Spine Liner SVG with named cutter layers and calibration square', () => {
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const svg = generateInnerTemplatesSvg(geom);

    expect(svg).toMatch(/width="[\d.]+mm"/);
    expect(svg).toMatch(/height="[\d.]+mm"/);
    expect(svg).toContain('<g id="glue-flaps"');
    expect(svg).toContain('<g id="cut-lines"');
    expect(svg).toContain('<g id="score-lines"');
    expect(svg).toContain('<g id="dimensions-notes"');
    expect(svg).toContain('data-label="Back Pocket Envelope"');
    expect(svg).toContain('data-label="Spine Reinforcement Liner"');
    expect(svg).toContain('data-label="Front Pocket Envelope"');
    expect(svg).toContain('width="50" height="50"');
  });
});
