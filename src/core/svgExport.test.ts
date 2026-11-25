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

  it('omits zero-width hinge labels on Flexible Spine and labels integrated Tuck Flaps on Softcover Jacket', () => {
    const flexGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'flexible-spine',
      pbThicknessMm: 5,
    });
    const flexSvg = generateOuterWrapSvg(flexGeom, 'single');
    expect(flexSvg).toContain('FLEX SPINE');
    expect(flexSvg).toContain('Cloth Spine Gap');
    expect(flexSvg).not.toContain('HINGE 0 mm');

    const softGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'softcover-jacket',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 5,
    });
    const softSvg = generateOuterWrapSvg(softGeom, 'single');
    expect(softSvg).toContain('Fold-and-Glue Slip Cover');
    expect(softSvg).toContain('<g id="glue-tabs"');
    expect(softSvg).toContain('TUCK FLAP 24.2 mm');
    expect(softSvg).toContain('GLUE BACK');
    expect(softSvg).toContain('BACK COVER');
    expect(softSvg).not.toContain('HINGE 0 mm');
    expect(softSvg).not.toContain('Turn-In 0 mm');
  });

  it('generates clean 4-vertex cut SVGs with zero glue tabs for paperback-wrap and dust-jacket', () => {
    const pbGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'paperback-wrap',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 10,
      includeBleed: false,
    });
    const pbSvg = generateOuterWrapSvg(pbGeom, 'single');
    expect(pbSvg).toContain('width="220mm"');
    expect(pbSvg).toContain('height="148mm"');
    expect(pbSvg).toContain('d="M 0 0 L 220 0 L 220 148 L 0 148 Z"');
    expect(pbSvg).toContain('data-label="Back Spine Fold"');
    expect(pbSvg).toContain('data-label="Front Spine Fold"');
    expect(pbSvg).toContain('BACK COVER');
    expect(pbSvg).toContain('SPINE 10 × 148 mm');
    expect(pbSvg).toContain('FRONT COVER');
    expect(pbSvg).toContain(
      'Paperback Cover 220 × 148 mm • Score 2 spine folds &amp; glue spine to textblock',
    );
    expect(pbSvg).not.toContain('<g id="glue-tabs"');
    expect(pbSvg).not.toContain('GLUE BACK');

    const djGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'dust-jacket',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 10,
      jacketFlapWidthMm: 50,
      includeBleed: false,
    });
    const djSvg = generateOuterWrapSvg(djGeom, 'single');
    expect(djSvg).toContain('width="323.5mm"');
    expect(djSvg).toContain('height="148mm"');
    expect(djSvg).toContain('d="M 0 0 L 323.5 0 L 323.5 148 L 0 148 Z"');
    expect(djSvg).toContain('data-label="Back Flap Fold"');
    expect(djSvg).toContain('data-label="Back Spine Fold"');
    expect(djSvg).toContain('data-label="Front Spine Fold"');
    expect(djSvg).toContain('data-label="Front Flap Fold"');
    expect(djSvg).toContain('BACK FLAP 50 mm');
    expect(djSvg).toContain('FRONT FLAP 50 mm');
    expect(djSvg).toContain('BACK COVER');
    expect(djSvg).toContain('FRONT COVER');
    expect(djSvg).toContain(
      'Dust Jacket 323.5 × 148 mm • 50 mm fold-in flaps • Score 4 vertical folds (no glue)',
    );
    expect(djSvg).not.toContain('<g id="glue-tabs"');
    expect(djSvg).not.toContain('GLUE BACK');
  });

  it('emits external fold-guide-ticks layer and honors independent cut/fold/tick options in single and 3-piece SVGs', () => {
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);

    const defaultSvg = generateOuterWrapSvg(geom, 'single');
    expect(defaultSvg).toContain('<g id="fold-guide-ticks" fill="none" stroke="#0066FF" stroke-width="0.35">');

    const noFoldSvg = generateOuterWrapSvg(geom, 'single', {
      includeCutLines: true,
      includeFoldLines: false,
      includeFoldGuideTicks: true,
    });
    expect(noFoldSvg).toContain('<g id="cut-lines" fill="none" stroke="#FF0000"');
    expect(noFoldSvg).toContain('<g id="board-guides" />');
    expect(noFoldSvg).toContain('<g id="fold-guide-ticks" fill="none" stroke="#0066FF"');

    const noCutNoTicksSvg = generateOuterWrapSvg(geom, 'single', {
      includeCutLines: false,
      includeFoldLines: true,
      includeFoldGuideTicks: false,
    });
    expect(noCutNoTicksSvg).toContain('<g id="cut-lines" />');
    expect(noCutNoTicksSvg).not.toContain('stroke="#FF0000"');
    expect(noCutNoTicksSvg).toContain('<g id="board-guides" fill="none" stroke="#0066FF"');
    expect(noCutNoTicksSvg).toContain('<g id="fold-guide-ticks" />');

    const splitSvg = generateOuterWrapSvg(geom, 'three-piece', {
      includeCutLines: false,
      includeFoldLines: false,
      includeFoldGuideTicks: true,
    });
    expect(splitSvg).toContain('<g id="cut-lines" />');
    expect(splitSvg).toContain('<g id="board-guides" />');
    expect(splitSvg).toContain('<g id="fold-guide-ticks" fill="none" stroke="#0066FF"');
  });
});
