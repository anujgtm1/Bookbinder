import { describe, expect, it } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import { BookParametersModel } from '@/types/bookParams';
import { CoverStudioModel } from '@/types/studio';
import { CoverImageLayerModel } from '@/types/studioLayer';
import { PRINT_DPI } from '@/types/units';
import { PreflightEngine } from './preflight';
import { computeStudioCanvasSpec } from './renderEngine';

describe('PreflightEngine', () => {
  it('passes cleanly when front cover art fills zone at 300 DPI, bleed is enabled, and spine has high contrast', () => {
    const params = BookParametersModel.createDefault();
    const geom = calculateCaseGeometry(params);
    const spec = computeStudioCanvasSpec(geom, PRINT_DPI);

    // 300 DPI cover image fitted cleanly to frontZoneRect
    const frontLayer = CoverImageLayerModel.createInRect({
      id: 'front-ok',
      dataUrl: 'data:image/png;base64,AAA',
      fileName: 'front-300dpi.png',
      naturalWidth: 2400,
      naturalHeight: 3600,
      targetRect: spec.frontZoneRect,
      mode: 'cover',
    });

    // Small decorative back emblem (< 35% of back board area) should NOT trigger a coverage gap
    const backEmblem = CoverImageLayerModel.createInRect({
      id: 'back-emblem',
      dataUrl: 'data:image/png;base64,BBB',
      fileName: 'emblem.png',
      naturalWidth: 900,
      naturalHeight: 900,
      targetRect: {
        x: spec.backZoneRect.x + 50,
        y: spec.backZoneRect.y + 80,
        width: 55,
        height: 55,
      },
    });

    const studio = {
      ...CoverStudioModel.createDefault(),
      spineBgColor: '#0e2d35',
      layers: [frontLayer, backEmblem],
      spineText: {
        ...CoverStudioModel.createDefault().spineText,
        title: 'DUNE',
        author: 'FRANK HERBERT',
        textColor: '#f5edd8',
      },
    };

    const report = PreflightEngine.evaluate(params, geom, studio);
    expect(report.status).toBe('pass');
    expect(report.errorCount).toBe(0);
    expect(report.warningCount).toBe(0);
    expect(report.checks.every((c) => c.status === 'pass')).toBe(true);
  });

  it('detects uncovered board gap (error) and uncovered outer turn-in/bleed gap (warning) with exact highlight rects', () => {
    const params = BookParametersModel.createDefault();
    const geom = calculateCaseGeometry(params);
    const spec = computeStudioCanvasSpec(geom, PRINT_DPI);

    // Shifted front cover leaving an uncovered top strip directly on the front chipboard face
    const shiftedFront = CoverImageLayerModel.createInRect({
      id: 'front-shifted',
      dataUrl: 'data:image/png;base64,AAA',
      fileName: 'front.png',
      naturalWidth: 2400,
      naturalHeight: 3600,
      targetRect: {
        x: spec.frontZoneRect.x,
        y: geom.outerWrap.frontBoardRect.y + spec.bleedMm + 15,
        width: spec.frontZoneRect.width,
        height: spec.frontZoneRect.height,
      },
      mode: 'cover',
    });

    const reportBoardGap = PreflightEngine.evaluate(params, geom, {
      ...CoverStudioModel.createDefault(),
      layers: [shiftedFront],
    });
    const boardIssue = reportBoardGap.issues.find((i) => i.id === 'front-board-gap');
    expect(boardIssue).toBeDefined();
    expect(boardIssue?.severity).toBe('error');
    expect(boardIssue?.highlights.length).toBeGreaterThan(0);
    expect(boardIssue?.quickFix).toEqual({
      kind: 'fit-layer',
      layerId: 'front-shifted',
      target: 'front',
      label: 'Fit to Front',
    });

    // Cover fills the board face cleanly, but stops short of the outer turn-in & bleed
    const boardOnlyFront = {
      ...shiftedFront,
      id: 'front-no-turnin',
      xMm: geom.outerWrap.frontBoardRect.x + spec.bleedMm,
      yMm: geom.outerWrap.frontBoardRect.y + spec.bleedMm,
      widthMm: geom.outerWrap.frontBoardRect.width,
      heightMm: geom.outerWrap.frontBoardRect.height,
    };

    const reportTurnIn = PreflightEngine.evaluate(params, geom, {
      ...CoverStudioModel.createDefault(),
      layers: [boardOnlyFront],
    });
    const turnInIssue = reportTurnIn.issues.find((i) => i.id === 'front-turnin-gap');
    expect(turnInIssue).toBeDefined();
    expect(turnInIssue?.severity).toBe('warning');
    expect(turnInIssue?.highlights.length).toBe(3); // top, bottom, right fore-edge turn-in strips
  });

  it('flags low print resolution DPI, off-canvas layers, disabled bleed, and low spine text contrast', () => {
    const params = { ...BookParametersModel.createDefault(), includeBleed: false };
    const geom = calculateCaseGeometry(params);
    const spec = computeStudioCanvasSpec(geom, PRINT_DPI);

    // Tiny pixel image stretched over the entire front zone (~60 DPI)
    const lowResLayer = CoverImageLayerModel.createInRect({
      id: 'low-res',
      dataUrl: 'data:image/png;base64,AAA',
      fileName: 'tiny-thumbnail.jpg',
      naturalWidth: 400,
      naturalHeight: 600,
      targetRect: spec.frontZoneRect,
      mode: 'cover',
    });

    // Completely off-canvas layer
    const offCanvasLayer = {
      ...lowResLayer,
      id: 'off-canvas',
      fileName: 'stray.png',
      xMm: spec.totalWidthMm + 100,
      yMm: 0,
    };

    const studio = {
      ...CoverStudioModel.createDefault(),
      spineBgColor: '#1f3a52',
      layers: [lowResLayer, offCanvasLayer],
      spineText: {
        ...CoverStudioModel.createDefault().spineText,
        title: 'SHADOW',
        textColor: '#25425b', // very low contrast against #1f3a52
      },
    };

    const report = PreflightEngine.evaluate(params, geom, studio);
    expect(report.status).toBe('error');
    expect(report.issues.some((i) => i.id === 'low-dpi-error-low-res')).toBe(true);
    expect(report.issues.some((i) => i.id === 'off-canvas-off-canvas')).toBe(true);
    expect(report.issues.some((i) => i.id === 'bleed-disabled')).toBe(true);
    const contrastIssue = report.issues.find((i) => i.id === 'spine-low-contrast-error');
    expect(contrastIssue).toBeDefined();
    expect(contrastIssue?.quickFix?.kind).toBe('high-contrast-spine-text');
  });

  it('flags narrow-spine horizontal author text and provides a Switch to Vertical quick fix', () => {
    const params = BookParametersModel.clampAndNormalize({
      ...BookParametersModel.createDefault(),
      pbThicknessMm: 10, // yields ~12 mm spine width
    });
    const geom = calculateCaseGeometry(params);
    const studio = {
      ...CoverStudioModel.createDefault(),
      spineText: {
        ...CoverStudioModel.createDefault().spineText,
        title: 'POEMS',
        author: 'CHRISTOPHER MARLOWE',
        authorOrientation: 'horizontal' as const,
        textColor: '#f5edd8',
      },
    };

    const report = PreflightEngine.evaluate(params, geom, studio);
    const horizIssue = report.issues.find((i) => i.id === 'spine-horizontal-author-small');
    expect(horizIssue).toBeDefined();
    expect(horizIssue?.quickFix).toEqual({
      kind: 'author-vertical',
      label: 'Switch to Vertical',
    });
  });
});
