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

  it('flags 2-sheet tiling with smart detach-flaps, flap-shrink, or media-switch quick fix, and flags print-media-overflow errors', () => {
    // 1. A6 softcover with 38 mm deep flaps on US Letter -> shrinking to 25.7 mm would be shallow (< 36.8 mm),
    // so preflight prioritizes 1-click Detach Flaps to Separate Inner Pockets (fits 1x US Letter!)
    const a6DeepLetter = BookParametersModel.clampAndNormalize({
      ...BookParametersModel.createDefault(),
      bindingStyle: 'softcover-jacket',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 5,
      jacketFlapWidthMm: 38,
      printMedia: 'letter',
    });
    const a6DeepReport = PreflightEngine.evaluate(
      a6DeepLetter,
      calculateCaseGeometry(a6DeepLetter),
      CoverStudioModel.createDefault(),
    );
    const flapTileIssue = a6DeepReport.issues.find((i) => i.id === 'print-media-tiled-2-pages');
    expect(flapTileIssue).toBeDefined();
    expect(flapTileIssue?.severity).toBe('warning');
    expect(flapTileIssue?.title).toContain('Requires 2 tiled pages on US Letter');
    expect(flapTileIssue?.quickFix).toEqual({
      kind: 'set-softcover-pocket-mode',
      pocketMode: 'separate',
      label: 'Detach Flaps to Inner Pockets (Fits 1× US Letter)',
    });

    // Applying the detach-flaps quick fix resolves the tiling warning completely (no shallow flap warning either!)
    const a6Detached = BookParametersModel.clampAndNormalize({
      ...a6DeepLetter,
      softcoverPocketMode: 'separate',
    });
    const a6DetachedReport = PreflightEngine.evaluate(
      a6Detached,
      calculateCaseGeometry(a6Detached),
      CoverStudioModel.createDefault(),
    );
    expect(a6DetachedReport.issues.some((i) => i.id === 'print-media-tiled-2-pages')).toBe(false);
    expect(a6DetachedReport.issues.some((i) => i.id === 'flap-too-shallow')).toBe(false);

    // 1b. Small pocket book (90 × 140 × 8 mm) on A4 with 55 mm flaps -> maxFlap = 48 mm >= 35 mm minRecommended,
    // so shrinking integrated flaps stays deep and offers set-jacket-flap-width
    const smallA4 = BookParametersModel.clampAndNormalize({
      ...BookParametersModel.createDefault(),
      bindingStyle: 'softcover-jacket',
      pbWidthMm: 90,
      pbHeightMm: 140,
      pbThicknessMm: 8,
      jacketFlapWidthMm: 55,
      printMedia: 'a4',
    });
    const smallA4Report = PreflightEngine.evaluate(
      smallA4,
      calculateCaseGeometry(smallA4),
      CoverStudioModel.createDefault(),
    );
    const smallA4Tile = smallA4Report.issues.find((i) => i.id === 'print-media-tiled-2-pages');
    expect(smallA4Tile?.quickFix).toEqual({
      kind: 'set-jacket-flap-width',
      flapWidthMm: 48,
      label: 'Fit Flaps to A4 (48 mm)',
    });

    // 2. Default Trade Digest hardcover (366 x 259 mm) on US Letter -> 2-sheet tile warning + Switch to Tabloid quick fix
    const digestLetter = BookParametersModel.clampAndNormalize({
      ...BookParametersModel.createDefault(),
      printMedia: 'letter',
    });
    const digestReport = PreflightEngine.evaluate(
      digestLetter,
      calculateCaseGeometry(digestLetter),
      CoverStudioModel.createDefault(),
    );
    const digestTileIssue = digestReport.issues.find((i) => i.id === 'print-media-tiled-2-pages');
    expect(digestTileIssue).toBeDefined();
    expect(digestTileIssue?.severity).toBe('warning');
    expect(digestTileIssue?.quickFix).toEqual({
      kind: 'set-print-media',
      printMedia: 'tabloid',
      label: 'Switch to Tabloid',
    });

    // 3. Softcover too wide for 22 mm flaps on 1 US Letter sheet -> explains lack of room + suggests larger media
    const wideSoftLetter = BookParametersModel.clampAndNormalize({
      ...BookParametersModel.createDefault(),
      bindingStyle: 'softcover-jacket',
      pbWidthMm: 130,
      pbHeightMm: 170,
      pbThicknessMm: 10,
      printMedia: 'letter',
    });
    const wideSoftReport = PreflightEngine.evaluate(
      wideSoftLetter,
      calculateCaseGeometry(wideSoftLetter),
      CoverStudioModel.createDefault(),
    );
    const wideSoftIssue = wideSoftReport.issues.find((i) => i.id === 'print-media-tiled-2-pages');
    expect(wideSoftIssue).toBeDefined();
    expect(wideSoftIssue?.detail).toContain('integrated flaps');
    expect(wideSoftIssue?.quickFix).toEqual({
      kind: 'set-print-media',
      printMedia: 'legal',
      label: 'Switch to US Legal',
    });

    // 4. Oversized book whose height exceeds US Letter longest printable side -> print-media-overflow error + Switch to 13" Roll
    const oversizedLetter = BookParametersModel.clampAndNormalize({
      ...BookParametersModel.createDefault(),
      pbWidthMm: 190,
      pbHeightMm: 275, // wrap height = 275 + 7 + 36 = 318 mm > 269.4 mm
      printMedia: 'letter',
    });
    const overflowReport = PreflightEngine.evaluate(
      oversizedLetter,
      calculateCaseGeometry(oversizedLetter),
      CoverStudioModel.createDefault(),
    );
    const overflowIssue = overflowReport.issues.find((i) => i.id === 'print-media-overflow');
    expect(overflowIssue).toBeDefined();
    expect(overflowIssue?.severity).toBe('error');
    expect(overflowIssue?.title).toContain('Cover does not fit on US Letter');
    expect(overflowIssue?.quickFix).toEqual({
      kind: 'set-print-media',
      printMedia: 'roll-13',
      label: 'Switch to 13" Roll',
    });
  });

  it('skips board-only checks on paperback-wrap & dust-jacket, supports dust-jacket flap quick-fix, and never suggests flexible-spine', () => {
    // 1. Thick pocket book on paperback-wrap -> zero board/hinge/rigid-spine/pocket warnings
    const pbParams = BookParametersModel.clampAndNormalize({
      ...BookParametersModel.createDefault(),
      bindingStyle: 'paperback-wrap',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 24,
      boardThicknessMm: 2.5,
      hingeWidthMm: 3,
      turnInMm: 8,
      printMedia: 'letter',
    });
    const pbReport = PreflightEngine.evaluate(
      pbParams,
      calculateCaseGeometry(pbParams),
      CoverStudioModel.createDefault(),
    );
    expect(pbReport.status).toBe('pass');
    expect(pbReport.issues).toHaveLength(0);

    // 2. Wide paperback-wrap tiling on US Letter -> suggests larger media (never flexible-spine or flap shrink)
    const widePbParams = BookParametersModel.clampAndNormalize({
      ...BookParametersModel.createDefault(),
      bindingStyle: 'paperback-wrap',
      pbWidthMm: 140,
      pbHeightMm: 200,
      pbThicknessMm: 24, // 304 x 200 mm -> 2 tiled sheets on Letter, fits Legal
      printMedia: 'letter',
    });
    const widePbReport = PreflightEngine.evaluate(
      widePbParams,
      calculateCaseGeometry(widePbParams),
      CoverStudioModel.createDefault(),
    );
    const widePbIssue = widePbReport.issues.find((i) => i.id === 'print-media-tiled-2-pages');
    expect(widePbIssue).toBeDefined();
    expect(widePbIssue?.quickFix).toEqual({
      kind: 'set-print-media',
      printMedia: 'legal',
      label: 'Switch to US Legal',
    });
    expect(
      widePbReport.issues.some(
        (i) => i.quickFix?.kind === 'switch-binding-style' || i.id === 'thick-book-non-rigid',
      ),
    ).toBe(false);

    // 3. Dust jacket on A6 with 50 mm flaps on US Letter -> 2-sheet tile + 1-click Fit Flaps quick fix (22.9 mm)
    const djLetter = BookParametersModel.clampAndNormalize({
      ...BookParametersModel.createDefault(),
      bindingStyle: 'dust-jacket',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 10,
      jacketFlapWidthMm: 50,
      printMedia: 'letter',
    });
    const djReport = PreflightEngine.evaluate(
      djLetter,
      calculateCaseGeometry(djLetter),
      CoverStudioModel.createDefault(),
    );
    expect(djReport.issues.some((i) => i.id === 'pocket-book-thick-board')).toBe(false);
    const djTileIssue = djReport.issues.find((i) => i.id === 'print-media-tiled-2-pages');
    expect(djTileIssue).toBeDefined();
    expect(djTileIssue?.quickFix).toEqual({
      kind: 'set-jacket-flap-width',
      flapWidthMm: 22.9,
      label: 'Fit Flaps to US Letter (22.9 mm)',
    });

    // Applying the flap quick-fix resolves the tiling warning completely
    const djFitted = BookParametersModel.clampAndNormalize({
      ...djLetter,
      jacketFlapWidthMm: 22.9,
    });
    const djFittedReport = PreflightEngine.evaluate(
      djFitted,
      calculateCaseGeometry(djFitted),
      CoverStudioModel.createDefault(),
    );
    expect(djFittedReport.issues.some((i) => i.id === 'print-media-tiled-2-pages')).toBe(false);

    // 4. Wide dust jacket (too wide for flaps on 1 Letter sheet) -> suggests larger sheet, never flexible-spine
    const wideDjParams = BookParametersModel.clampAndNormalize({
      ...BookParametersModel.createDefault(),
      bindingStyle: 'dust-jacket',
      pbWidthMm: 140,
      pbHeightMm: 200,
      pbThicknessMm: 24,
      jacketFlapWidthMm: 70,
      printMedia: 'letter',
    });
    const wideDjReport = PreflightEngine.evaluate(
      wideDjParams,
      calculateCaseGeometry(wideDjParams),
      CoverStudioModel.createDefault(),
    );
    const wideDjIssue = wideDjReport.issues.find((i) => i.id === 'print-media-tiled-2-pages');
    expect(wideDjIssue).toBeDefined();
    expect(wideDjIssue?.detail).not.toContain('Flexible Spine');
    expect(wideDjIssue?.quickFix?.kind).toBe('set-print-media');
  });

  it('flags shallow flaps for softcover-jacket and dust-jacket with 1-click recommended width quick fix and flap highlights', () => {
    // 1. Softcover slip cover: 140 mm wide book with 24 mm flap -> recommends >= 49 mm
    const shallowSlip = BookParametersModel.clampAndNormalize({
      ...BookParametersModel.createDefault(),
      bindingStyle: 'softcover-jacket',
      pbWidthMm: 140,
      jacketFlapWidthMm: 24,
    });
    const slipGeom = calculateCaseGeometry(shallowSlip);
    const slipReport = PreflightEngine.evaluate(
      shallowSlip,
      slipGeom,
      CoverStudioModel.createDefault(),
    );
    const slipIssue = slipReport.issues.find((i) => i.id === 'flap-too-shallow');
    expect(slipIssue).toBeDefined();
    expect(slipIssue?.severity).toBe('warning');
    expect(slipIssue?.category).toBe('structure');
    expect(slipIssue?.title).toBe('Flap is too shallow for this page width');
    expect(slipIssue?.detail).toContain('24 mm');
    expect(slipIssue?.detail).toContain('≥ 49 mm');
    expect(slipIssue?.highlights).toHaveLength(2);
    expect(slipIssue?.highlights[0]?.rect.width).toBeCloseTo(24, 1);
    expect(slipIssue?.highlights[1]?.rect.width).toBeCloseTo(24, 1);
    expect(slipIssue?.quickFix).toEqual({
      kind: 'set-jacket-flap-width',
      flapWidthMm: 49,
      label: 'Set Flap to 49 mm (Recommended)',
    });

    // Applying the 49 mm quick fix clears flap-too-shallow
    const fixedSlip = BookParametersModel.clampAndNormalize({
      ...shallowSlip,
      jacketFlapWidthMm: 49,
    });
    const fixedSlipReport = PreflightEngine.evaluate(
      fixedSlip,
      calculateCaseGeometry(fixedSlip),
      CoverStudioModel.createDefault(),
    );
    expect(fixedSlipReport.issues.some((i) => i.id === 'flap-too-shallow')).toBe(false);

    // 2. Classic dust jacket: 140 mm wide book with 35 mm flap -> recommends >= 63 mm
    const shallowDj = BookParametersModel.clampAndNormalize({
      ...BookParametersModel.createDefault(),
      bindingStyle: 'dust-jacket',
      pbWidthMm: 140,
      jacketFlapWidthMm: 35,
    });
    const djGeom = calculateCaseGeometry(shallowDj);
    const djReport = PreflightEngine.evaluate(
      shallowDj,
      djGeom,
      CoverStudioModel.createDefault(),
    );
    const djIssue = djReport.issues.find((i) => i.id === 'flap-too-shallow');
    expect(djIssue).toBeDefined();
    expect(djIssue?.severity).toBe('warning');
    expect(djIssue?.detail).toContain('35 mm');
    expect(djIssue?.detail).toContain('≥ 63 mm');
    expect(djIssue?.highlights).toHaveLength(2);
    expect(djIssue?.quickFix).toEqual({
      kind: 'set-jacket-flap-width',
      flapWidthMm: 63,
      label: 'Set Flap to 63 mm (Recommended)',
    });

    // Applying the 63 mm quick fix clears flap-too-shallow
    const fixedDj = BookParametersModel.clampAndNormalize({
      ...shallowDj,
      jacketFlapWidthMm: 63,
    });
    const fixedDjReport = PreflightEngine.evaluate(
      fixedDj,
      calculateCaseGeometry(fixedDj),
      CoverStudioModel.createDefault(),
    );
    expect(fixedDjReport.issues.some((i) => i.id === 'flap-too-shallow')).toBe(false);
  });

  it('produces zero front-turnin-gap or board-gap issues when a front cover image is fitted to frontArtworkRect on a slip cover', () => {
    const slipParams = BookParametersModel.clampAndNormalize({
      ...BookParametersModel.createDefault(),
      bindingStyle: 'softcover-jacket',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 5,
      jacketFlapWidthMm: 38,
    });
    const slipGeom = calculateCaseGeometry(slipParams);
    const slipSpec = computeStudioCanvasSpec(slipGeom, 300);
    const frontLayer = CoverImageLayerModel.createInRect({
      fileName: 'a6-front.png',
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      naturalWidth: 1600,
      naturalHeight: 2200,
      targetRect: slipSpec.frontArtworkRect,
      clipZone: 'front',
    });
    const studio = {
      ...CoverStudioModel.createDefault(),
      layers: [frontLayer],
    };
    const report = PreflightEngine.evaluate(slipParams, slipGeom, studio);
    expect(report.issues.some((i) => i.id === 'front-board-gap')).toBe(false);
    expect(report.issues.some((i) => i.id === 'front-turnin-gap')).toBe(false);
  });
});
