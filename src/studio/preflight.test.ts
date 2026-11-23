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

  it('supports optional DPI check toggle, includes max crisp 300-DPI dimensions, and allows ignoring/restoring individual warnings', () => {
    const params = { ...BookParametersModel.createDefault(), includeBleed: false };
    const geom = calculateCaseGeometry(params);
    const spec = computeStudioCanvasSpec(geom, PRINT_DPI);

    // 600x900 px image placed across frontZoneRect (~90 DPI -> triggers low-dpi-error)
    // At 300 DPI, 600x900 px is crisp up to ~51 x 76 mm
    const lowResLayer = CoverImageLayerModel.createInRect({
      id: 'low-res-1',
      dataUrl: 'data:image/png;base64,AAA',
      fileName: 'vintage-plate.jpg',
      naturalWidth: 600,
      naturalHeight: 900,
      targetRect: spec.frontZoneRect,
      mode: 'cover',
    });

    const studio = {
      ...CoverStudioModel.createDefault(),
      layers: [lowResLayer],
    };

    // 1. Default (DPI check ON): reports low-dpi error with 300-DPI max physical size hint
    const defaultReport = PreflightEngine.evaluate(params, geom, studio);
    const dpiIssue = defaultReport.issues.find((i) => i.id === 'low-dpi-error-low-res-1');
    expect(dpiIssue).toBeDefined();
    expect(dpiIssue?.detail).toContain('Crisp at 300 DPI up to 51 × 76 mm');
    expect(defaultReport.ignoredCount).toBe(0);

    // 2. With checkDpi: false, DPI issue is skipped and resolution summary is 'skipped',
    //    while bleed-disabled warning remains active
    const dpiOffReport = PreflightEngine.evaluate(params, geom, studio, { checkDpi: false });
    expect(dpiOffReport.issues.some((i) => i.category === 'resolution')).toBe(false);
    expect(dpiOffReport.issues.some((i) => i.id === 'bleed-disabled')).toBe(true);
    const resCheck = dpiOffReport.checks.find((c) => c.id === 'resolution');
    expect(resCheck?.status).toBe('skipped');
    expect(resCheck?.label).toBe('DPI Check (Off)');

    // 3. Ignoring individual issues suppresses them, updates ignoredCount, and clears status when all are ignored
    const ignoredOne = PreflightEngine.evaluate(params, geom, studio, {
      ignoredIssueIds: new Set(['low-dpi-error-low-res-1', 'non-existent-id']),
    });
    expect(ignoredOne.issues.some((i) => i.id === 'low-dpi-error-low-res-1')).toBe(false);
    expect(ignoredOne.ignoredCount).toBe(1);
    expect(ignoredOne.errorCount).toBe(0);
    expect(ignoredOne.status).toBe('warning'); // bleed-disabled still active

    const ignoredAll = PreflightEngine.evaluate(params, geom, studio, {
      ignoredIssueIds: new Set(['low-dpi-error-low-res-1', 'bleed-disabled']),
    });
    expect(ignoredAll.issues).toHaveLength(0);
    expect(ignoredAll.ignoredCount).toBe(2);
    expect(ignoredAll.status).toBe('pass');
  });

  it('recommends Flexible Spine for thin (<8 mm) A6 notebooks, Pocket Proportions for narrow books, and Rigid Spine for thick (>=18 mm) books', () => {
    const thinA6 = BookParametersModel.clampAndNormalize({
      ...BookParametersModel.createDefault(),
      bindingStyle: 'rigid-case',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 5,
      boardThicknessMm: 2.0,
    });
    const thinReport = PreflightEngine.evaluate(
      thinA6,
      calculateCaseGeometry(thinA6),
      CoverStudioModel.createDefault(),
    );
    const flexRec = thinReport.issues.find((i) => i.id === 'thin-book-rigid-spine');
    expect(flexRec?.quickFix).toEqual({
      kind: 'switch-binding-style',
      bindingStyle: 'flexible-spine',
      label: 'Switch to Flexible Spine',
    });
    const pocketRec = thinReport.issues.find((i) => i.id === 'pocket-book-thick-board');
    expect(pocketRec?.quickFix?.kind).toBe('apply-pocket-proportions');

    // Thick 24 mm book on flexible-spine -> recommends Rigid Spine
    const thickFlex = BookParametersModel.clampAndNormalize({
      ...BookParametersModel.createDefault(),
      bindingStyle: 'flexible-spine',
      pbThicknessMm: 24,
    });
    const thickReport = PreflightEngine.evaluate(
      thickFlex,
      calculateCaseGeometry(thickFlex),
      CoverStudioModel.createDefault(),
    );
    const rigidRec = thickReport.issues.find((i) => i.id === 'thick-book-non-rigid');
    expect(rigidRec?.quickFix).toEqual({
      kind: 'switch-binding-style',
      bindingStyle: 'rigid-case',
      label: 'Switch to Rigid Spine',
    });
  });
});
