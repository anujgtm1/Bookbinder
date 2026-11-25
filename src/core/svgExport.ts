import { escapeXml, fmtMm } from '@/lib/svgFormat';
import type { SplitMode } from '@/types/bookParams';
import {
  GeometryPrimitives,
  type CaseGeometry,
  type PocketEnvelopeGeometry,
  type Rect2D,
} from '@/types/geometry';
import {
  PdfGuideOptionsModel,
  type PdfGuideOptions,
  type PdfGuideOptionsInput,
} from '@/types/pdfGuides';
import { roundTo } from '@/types/units';
import { resolveBindingStrategy } from './bindingStyles';
import {
  computeExternalFoldGuideTicks,
  deriveSplitPanelFoldLines,
  translateTicks,
} from './foldGuideTicks';

const SPLIT_PANEL_GAP_MM = 12;

function svgRect(rect: Rect2D, attrs: string): string {
  return `<rect x="${fmtMm(rect.x)}" y="${fmtMm(rect.y)}" width="${fmtMm(rect.width)}" height="${fmtMm(rect.height)}" ${attrs} />`;
}

function renderSinglePieceSvg(geometry: CaseGeometry, guides: PdfGuideOptions): string {
  const { outerWrap, cutList } = geometry;
  const bleed = outerWrap.includeBleed ? outerWrap.bleedMm : 0;
  const totalWidth = roundTo(outerWrap.widthMm + bleed * 2, 3);
  const totalHeight = roundTo(outerWrap.heightMm + bleed * 2, 3);
  const viewBox = `${fmtMm(-bleed)} ${fmtMm(-bleed)} ${fmtMm(totalWidth)} ${fmtMm(totalHeight)}`;

  const cutPath = GeometryPrimitives.polygonToSvgPath(outerWrap.outerCutPolygon, 3);

  const bleedGroup =
    bleed > 0
      ? `  <g id="bleed-box" fill="none" stroke="#00AA44" stroke-width="0.35" stroke-dasharray="3 2">
    ${svgRect(outerWrap.bleedRect, `data-label="Bleed (${fmtMm(bleed)} mm)"`)}
  </g>`
      : `  <g id="bleed-box" />`;

  const strategy = resolveBindingStrategy(outerWrap);
  const { capabilities, panelLabels } = strategy;
  const hasHinges = cutList.hingeSpacerMm > 0;
  const usesPlacementRects = capabilities.usesChipboard || capabilities.hasGlueTabs;

  const boardGuides = usesPlacementRects
    ? [
        svgRect(outerWrap.backBoardRect, `data-label="${escapeXml(panelLabels.back)}"`),
        svgRect(outerWrap.spineRect, `data-label="${escapeXml(panelLabels.spine)}"`),
        svgRect(outerWrap.frontBoardRect, `data-label="${escapeXml(panelLabels.front)}"`),
      ].join('\n    ')
    : outerWrap.foldLines
        .map(
          (line) =>
            `<line x1="${fmtMm(line.x1)}" y1="${fmtMm(line.y1)}" x2="${fmtMm(line.x2)}" y2="${fmtMm(line.y2)}"${line.label ? ` data-label="${escapeXml(line.label)}"` : ''} />`,
        )
        .join('\n    ');

  const hingeGuides = hasHinges
    ? [
        svgRect(outerWrap.leftHingeRect, 'stroke-dasharray="1.5 1.5" stroke-opacity="0.7" data-label="Left Hinge"'),
        svgRect(outerWrap.rightHingeRect, 'stroke-dasharray="1.5 1.5" stroke-opacity="0.7" data-label="Right Hinge"'),
      ].join('\n    ')
    : '';

  const flapGuides =
    usesPlacementRects && capabilities.hasFlaps && outerWrap.jacketFlapWidthMm > 0
      ? [
          svgRect(
            {
              x: 0,
              y: outerWrap.jacketGlueTabHeightMm,
              width: outerWrap.jacketFlapWidthMm,
              height: cutList.coverBoards.heightMm,
            },
            `stroke-dasharray="2 2" stroke-opacity="0.8" data-label="${escapeXml(panelLabels.leftFlap ?? 'Back Flap')}"`,
          ),
          svgRect(
            {
              x: outerWrap.widthMm - outerWrap.jacketFlapWidthMm,
              y: outerWrap.jacketGlueTabHeightMm,
              width: outerWrap.jacketFlapWidthMm,
              height: cutList.coverBoards.heightMm,
            },
            `stroke-dasharray="2 2" stroke-opacity="0.8" data-label="${escapeXml(panelLabels.rightFlap ?? 'Front Flap')}"`,
          ),
        ].join('\n    ')
      : '';

  const glueTabGroup =
    guides.includeFoldLines && capabilities.hasGlueTabs && outerWrap.jacketGlueTabPolygons.length > 0
      ? `  <g id="glue-tabs" fill="#e6dccb" fill-opacity="0.65" stroke="#A67B2E" stroke-width="0.25" stroke-dasharray="2 1.5">
    ${outerWrap.jacketGlueTabPolygons
      .map(
        (poly, idx) =>
          `<path d="${GeometryPrimitives.polygonToSvgPath(poly, 3)}" data-label="Glue Tab ${idx + 1}" />`,
      )
      .join('\n    ')}
  </g>`
      : '';

  const cutLinesGroup = guides.includeCutLines
    ? `  <g id="cut-lines" fill="none" stroke="#FF0000" stroke-width="0.4">
    <path d="${cutPath}" data-label="Outer Case Wrap Cut Polygon" />
  </g>`
    : `  <g id="cut-lines" />`;

  const boardGuidesGroup = guides.includeFoldLines
    ? `  <g id="board-guides" fill="none" stroke="#0066FF" stroke-width="0.35" stroke-dasharray="4 2">
    ${boardGuides}
    ${hingeGuides}
    ${flapGuides}
  </g>`
    : `  <g id="board-guides" />`;

  const foldGuideTicks = guides.includeFoldGuideTicks
    ? computeExternalFoldGuideTicks(outerWrap.outerCutPolygon, outerWrap.foldLines)
    : [];
  const foldGuideTicksGroup =
    foldGuideTicks.length > 0
      ? `  <g id="fold-guide-ticks" fill="none" stroke="#0066FF" stroke-width="0.35">
    ${foldGuideTicks
      .map(
        (tick) =>
          `<line x1="${fmtMm(tick.x1)}" y1="${fmtMm(tick.y1)}" x2="${fmtMm(tick.x2)}" y2="${fmtMm(tick.y2)}"${tick.label ? ` data-label="${escapeXml(tick.label)}"` : ''} />`,
      )
      .join('\n    ')}
  </g>`
      : `  <g id="fold-guide-ticks" />`;

  const backCenter = GeometryPrimitives.rectCenter(outerWrap.backBoardRect);
  const spineCenter = GeometryPrimitives.rectCenter(outerWrap.spineRect);
  const frontCenter = GeometryPrimitives.rectCenter(outerWrap.frontBoardRect);
  const leftHingeCenter = GeometryPrimitives.rectCenter(outerWrap.leftHingeRect);
  const rightHingeCenter = GeometryPrimitives.rectCenter(outerWrap.rightHingeRect);

  const boardDim = `${roundTo(cutList.coverBoards.widthMm, 1)} × ${roundTo(cutList.coverBoards.heightMm, 1)} mm`;
  const spineDim = `${roundTo(cutList.spineStrip.widthMm, 1)} × ${roundTo(cutList.spineStrip.heightMm, 1)} mm`;
  const wrapDim = `${roundTo(outerWrap.widthMm, 1)} × ${roundTo(outerWrap.heightMm, 1)} mm`;

  const hingeNotes = hasHinges
    ? `    <text x="${fmtMm(leftHingeCenter.x)}" y="${fmtMm(leftHingeCenter.y)}" font-size="3.2" transform="rotate(-90 ${fmtMm(leftHingeCenter.x)} ${fmtMm(leftHingeCenter.y)})">HINGE ${fmtMm(cutList.hingeSpacerMm)} mm</text>
    <text x="${fmtMm(rightHingeCenter.x)}" y="${fmtMm(rightHingeCenter.y)}" font-size="3.2" transform="rotate(-90 ${fmtMm(rightHingeCenter.x)} ${fmtMm(rightHingeCenter.y)})">HINGE ${fmtMm(cutList.hingeSpacerMm)} mm</text>`
    : '';

  const flapNotes =
    capabilities.hasFlaps &&
    outerWrap.jacketFlapWidthMm > 0 &&
    panelLabels.leftFlap &&
    panelLabels.rightFlap
      ? `    <text x="${fmtMm(outerWrap.jacketFlapWidthMm / 2)}" y="${fmtMm(outerWrap.heightMm / 2)}" font-size="3.6" transform="rotate(-90 ${fmtMm(outerWrap.jacketFlapWidthMm / 2)} ${fmtMm(outerWrap.heightMm / 2)})">${escapeXml(panelLabels.leftFlap)} ${fmtMm(outerWrap.jacketFlapWidthMm)} mm</text>
    <text x="${fmtMm(outerWrap.widthMm - outerWrap.jacketFlapWidthMm / 2)}" y="${fmtMm(outerWrap.heightMm / 2)}" font-size="3.6" transform="rotate(-90 ${fmtMm(outerWrap.widthMm - outerWrap.jacketFlapWidthMm / 2)} ${fmtMm(outerWrap.heightMm / 2)})">${escapeXml(panelLabels.rightFlap)} ${fmtMm(outerWrap.jacketFlapWidthMm)} mm</text>`
      : '';

  const glueTabNotes =
    guides.includeFoldLines && capabilities.hasGlueTabs && outerWrap.jacketGlueTabPolygons.length > 0
      ? outerWrap.jacketGlueTabPolygons
          .map((poly) => {
            const bbox = GeometryPrimitives.boundingBox(poly);
            return `    <text x="${fmtMm(bbox.x + bbox.width / 2)}" y="${fmtMm(bbox.y + bbox.height / 2)}" font-size="3.1" font-weight="600" fill="#7A5212">GLUE BACK</text>`;
          })
          .join('\n')
      : '';

  const headerNoteY =
    outerWrap.turnInMm > 0
      ? outerWrap.turnInMm / 2
      : outerWrap.jacketGlueTabHeightMm > 0
        ? outerWrap.jacketGlueTabHeightMm / 2
        : 6;
  const headerNote = escapeXml(strategy.buildExportNote(outerWrap, cutList));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${fmtMm(totalWidth)}mm"
     height="${fmtMm(totalHeight)}mm"
     viewBox="${viewBox}">
  <title>Outer Case Wrap — ${escapeXml(wrapDim)}</title>
${bleedGroup}
${glueTabGroup}
${cutLinesGroup}
${boardGuidesGroup}
${foldGuideTicksGroup}
  <g id="dimensions-notes" font-family="sans-serif" fill="#0066FF" text-anchor="middle" dominant-baseline="middle">
    <text x="${fmtMm(backCenter.x)}" y="${fmtMm(backCenter.y - 4)}" font-size="6" font-weight="600">${escapeXml(panelLabels.back)}</text>
    <text x="${fmtMm(backCenter.x)}" y="${fmtMm(backCenter.y + 4)}" font-size="4.5">${escapeXml(boardDim)}</text>
    <text x="${fmtMm(frontCenter.x)}" y="${fmtMm(frontCenter.y - 4)}" font-size="6" font-weight="600">${escapeXml(panelLabels.front)}</text>
    <text x="${fmtMm(frontCenter.x)}" y="${fmtMm(frontCenter.y + 4)}" font-size="4.5">${escapeXml(boardDim)}</text>
    <text x="${fmtMm(spineCenter.x)}" y="${fmtMm(spineCenter.y)}" font-size="4.2" font-weight="600" transform="rotate(-90 ${fmtMm(spineCenter.x)} ${fmtMm(spineCenter.y)})">${escapeXml(panelLabels.spine)} ${escapeXml(spineDim)}</text>
${hingeNotes}
${flapNotes}
${glueTabNotes}
    <text x="${fmtMm(outerWrap.widthMm / 2)}" y="${fmtMm(headerNoteY)}" font-size="3.2" fill="#444444">${headerNote}</text>
  </g>
</svg>
`;
}

function renderThreePieceSvg(geometry: CaseGeometry, guides: PdfGuideOptions): string {
  const { splitPanels, outerWrap } = geometry;
  const bleed = outerWrap.includeBleed ? outerWrap.bleedMm : 0;

  let cursorX = 0;
  const positioned = splitPanels.map((panel) => {
    const xOffset = cursorX;
    cursorX += panel.widthMm + SPLIT_PANEL_GAP_MM;
    return { panel, xOffset };
  });

  const contentWidth = Math.max(0, cursorX - SPLIT_PANEL_GAP_MM);
  const contentHeight = outerWrap.heightMm;
  const totalWidth = roundTo(contentWidth + bleed * 2, 3);
  const totalHeight = roundTo(contentHeight + bleed * 2, 3);
  const viewBox = `${fmtMm(-bleed)} ${fmtMm(-bleed)} ${fmtMm(totalWidth)} ${fmtMm(totalHeight)}`;

  const bleedElements =
    bleed > 0
      ? positioned
          .map(({ panel, xOffset }) =>
            svgRect(
              {
                x: xOffset - bleed,
                y: -bleed,
                width: panel.widthMm + bleed * 2,
                height: panel.heightMm + bleed * 2,
              },
              `data-label="${escapeXml(panel.label)} Bleed"`,
            ),
          )
          .join('\n    ')
      : '';

  const cutElements = guides.includeCutLines
    ? positioned
        .map(({ panel, xOffset }) => {
          const shifted = GeometryPrimitives.translatePolygon(panel.cutPolygon, xOffset, 0);
          return `<path d="${GeometryPrimitives.polygonToSvgPath(shifted, 3)}" data-label="${escapeXml(panel.label)}" />`;
        })
        .join('\n    ')
    : '';

  const guideElements = guides.includeFoldLines
    ? positioned
        .flatMap(({ panel, xOffset }) =>
          panel.guideRects.map(({ label, rect }) =>
            svgRect(
              { ...rect, x: rect.x + xOffset },
              `data-label="${escapeXml(`${panel.label} — ${label}`)}"`,
            ),
          ),
        )
        .join('\n    ')
    : '';

  const tickElements = guides.includeFoldGuideTicks
    ? positioned
        .flatMap(({ panel, xOffset }) => {
          const panelTicks = translateTicks(
            computeExternalFoldGuideTicks(panel.cutPolygon, deriveSplitPanelFoldLines(panel)),
            xOffset,
            0,
          );
          return panelTicks.map(
            (tick) =>
              `<line x1="${fmtMm(tick.x1)}" y1="${fmtMm(tick.y1)}" x2="${fmtMm(tick.x2)}" y2="${fmtMm(tick.y2)}"${tick.label ? ` data-label="${escapeXml(`${panel.label} — ${tick.label}`)}"` : ''} />`,
          );
        })
        .join('\n    ')
    : '';

  const cutLinesGroup = guides.includeCutLines
    ? `  <g id="cut-lines" fill="none" stroke="#FF0000" stroke-width="0.4">
    ${cutElements}
  </g>`
    : `  <g id="cut-lines" />`;

  const boardGuidesGroup = guides.includeFoldLines
    ? `  <g id="board-guides" fill="none" stroke="#0066FF" stroke-width="0.35" stroke-dasharray="4 2">
    ${guideElements}
  </g>`
    : `  <g id="board-guides" />`;

  const foldGuideTicksGroup = tickElements
    ? `  <g id="fold-guide-ticks" fill="none" stroke="#0066FF" stroke-width="0.35">
    ${tickElements}
  </g>`
    : `  <g id="fold-guide-ticks" />`;

  const noteElements = positioned
    .map(({ panel, xOffset }) => {
      const cx = xOffset + panel.widthMm / 2;
      const cy = panel.heightMm / 2;
      const dim = `${roundTo(panel.widthMm, 1)} × ${roundTo(panel.heightMm, 1)} mm`;
      return `    <text x="${fmtMm(cx)}" y="${fmtMm(cy - 4)}" font-size="5" font-weight="600">${escapeXml(panel.label.toUpperCase())}</text>
    <text x="${fmtMm(cx)}" y="${fmtMm(cy + 4)}" font-size="4">${escapeXml(dim)}</text>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${fmtMm(totalWidth)}mm"
     height="${fmtMm(totalHeight)}mm"
     viewBox="${viewBox}">
  <title>Outer Case Wrap — 3-Piece Quarter-Bound Split</title>
  <g id="bleed-box" fill="none" stroke="#00AA44" stroke-width="0.35" stroke-dasharray="3 2">
    ${bleedElements}
  </g>
${cutLinesGroup}
${boardGuidesGroup}
${foldGuideTicksGroup}
  <g id="dimensions-notes" font-family="sans-serif" fill="#0066FF" text-anchor="middle" dominant-baseline="middle">
${noteElements}
  </g>
</svg>
`;
}

export function generateOuterWrapSvg(
  geometry: CaseGeometry,
  splitMode: SplitMode,
  options?: PdfGuideOptionsInput,
): string {
  const guides = PdfGuideOptionsModel.resolve('template', options);
  return splitMode === 'three-piece'
    ? renderThreePieceSvg(geometry, guides)
    : renderSinglePieceSvg(geometry, guides);
}

/**
 * Generates an exact 1:1 physical mm SVG of Back Pocket, Spine Liner, Front Pocket,
 * and a 50 × 50 mm calibration square organized into named Affinity / cutter layers.
 */
export function generateInnerTemplatesSvg(geometry: CaseGeometry): string {
  const { backPocket, spineLiner, frontPocket } = geometry;
  const isFoldedEndpapers = frontPocket.kind === 'folded-endpaper';
  const pad = 10;
  const gap = 14;
  const calHeaderH = 58; // 50 mm calibration square + breathing room

  const backX = pad;
  const linerX = backX + backPocket.totalWidthMm + gap;
  const frontX = linerX + spineLiner.widthMm + gap;

  const contentW = frontX + frontPocket.totalWidthMm + pad;
  const maxPieceH = Math.max(
    backPocket.totalHeightMm,
    spineLiner.heightMm,
    frontPocket.totalHeightMm,
  );
  const piecesTopY = pad + calHeaderH;
  const totalH = piecesTopY + maxPieceH + pad;
  const linerY = piecesTopY + (maxPieceH - spineLiner.heightMm) / 2;

  const shiftPoly = (poly: typeof backPocket.outerCutPolygon, dx: number, dy: number) =>
    GeometryPrimitives.polygonToSvgPath(GeometryPrimitives.translatePolygon(poly, dx, dy), 3);

  const glueFlapPaths = [
    ...backPocket.glueFlapPolygons.map((f) => `<path d="${shiftPoly(f, backX, piecesTopY)}" />`),
    ...frontPocket.glueFlapPolygons.map((f) => `<path d="${shiftPoly(f, frontX, piecesTopY)}" />`),
  ].join('\n    ');

  const cutPaths = [
    `<path d="${shiftPoly(backPocket.outerCutPolygon, backX, piecesTopY)}" data-label="${escapeXml(backPocket.label)}" />`,
    svgRect(
      { x: linerX, y: linerY, width: spineLiner.widthMm, height: spineLiner.heightMm },
      'data-label="Spine Reinforcement Liner"',
    ),
    `<path d="${shiftPoly(frontPocket.outerCutPolygon, frontX, piecesTopY)}" data-label="${escapeXml(frontPocket.label)}" />`,
  ].join('\n    ');

  const scoreLines = [
    ...backPocket.scoreLines.map(
      (l) =>
        `<line x1="${fmtMm(l.x1 + backX)}" y1="${fmtMm(l.y1 + piecesTopY)}" x2="${fmtMm(l.x2 + backX)}" y2="${fmtMm(l.y2 + piecesTopY)}"${l.label ? ` data-label="${escapeXml(l.label)}"` : ''} />`,
    ),
    ...spineLiner.scoreLines.map(
      (l) =>
        `<line x1="${fmtMm(l.x1 + linerX)}" y1="${fmtMm(l.y1 + linerY)}" x2="${fmtMm(l.x2 + linerX)}" y2="${fmtMm(l.y2 + linerY)}"${l.label ? ` data-label="${escapeXml(l.label)}"` : ''} />`,
    ),
    ...frontPocket.scoreLines.map(
      (l) =>
        `<line x1="${fmtMm(l.x1 + frontX)}" y1="${fmtMm(l.y1 + piecesTopY)}" x2="${fmtMm(l.x2 + frontX)}" y2="${fmtMm(l.y2 + piecesTopY)}"${l.label ? ` data-label="${escapeXml(l.label)}"` : ''} />`,
    ),
  ].join('\n    ');

  const backCenter = GeometryPrimitives.translatePoint(
    GeometryPrimitives.rectCenter(backPocket.faceRect),
    backX,
    piecesTopY,
  );
  const frontCenter = GeometryPrimitives.translatePoint(
    GeometryPrimitives.rectCenter(frontPocket.faceRect),
    frontX,
    piecesTopY,
  );
  const linerCenter = {
    x: linerX + spineLiner.widthMm / 2,
    y: linerY + spineLiner.heightMm / 2,
  };

  const pocketDim = `${roundTo(frontPocket.pocketWidthMm, 1)} × ${roundTo(frontPocket.pocketHeightMm, 1)} mm`;
  const sheetDim = `${roundTo(frontPocket.totalWidthMm, 1)} × ${roundTo(frontPocket.totalHeightMm, 1)} mm`;
  const linerDim = `${roundTo(spineLiner.widthMm, 1)} × ${roundTo(spineLiner.heightMm, 1)} mm`;

  const svgTitle = isFoldedEndpapers
    ? 'Folded Endpapers (Pastedown + Flyleaf) &amp; Spine Liner — Vector Templates'
    : 'Inner Pockets &amp; Spine Liner — Vector Templates';
  const headerTitle = isFoldedEndpapers
    ? 'FOLDED ENDPAPERS (PASTEDOWN + FLYLEAF) &amp; SPINE LINER'
    : 'INNER POCKETS &amp; SPINE LINER';
  const legendLine = isFoldedEndpapers
    ? 'Solid Red = Cut • Dashed Blue = Center Fold &amp; Score Lines'
    : 'Solid Red = Cut • Dashed Blue = Score &amp; Fold • Shaded = Apply Glue Here';

  const buildPocketInsetNote = (pocket: PocketEnvelopeGeometry, cx: number, cy: number): string =>
    pocket.boardInsetTopBottomMm !== undefined && pocket.boardInsetForeEdgeMm !== undefined
      ? `\n    <text x="${fmtMm(cx)}" y="${fmtMm(cy + 16.5)}" font-size="3.3" fill="#555555" text-anchor="middle">${escapeXml(`Glue inset: ${roundTo(pocket.boardInsetTopBottomMm, 1)} mm T/B · ${roundTo(pocket.boardInsetForeEdgeMm, 1)} mm fore-edge`)}</text>`
      : '';

  const backPieceNotes = isFoldedEndpapers
    ? `    <text x="${fmtMm(backCenter.x)}" y="${fmtMm(piecesTopY + 12)}" font-size="4.8" font-weight="600" text-anchor="middle">BACK FOLDED ENDPAPER</text>
    <text x="${fmtMm(backCenter.x)}" y="${fmtMm(piecesTopY + 18)}" font-size="3.6" fill="#555555" text-anchor="middle">${escapeXml(sheetDim)}</text>
    <text x="${fmtMm(backX + backPocket.pocketWidthMm * 0.5)}" y="${fmtMm(backCenter.y - 3)}" font-size="4.8" font-weight="600" text-anchor="middle">FLYLEAF</text>
    <text x="${fmtMm(backX + backPocket.pocketWidthMm * 0.5)}" y="${fmtMm(backCenter.y + 4)}" font-size="3.8" text-anchor="middle">${escapeXml(pocketDim)}</text>
    <text x="${fmtMm(backX + backPocket.pocketWidthMm * 1.5)}" y="${fmtMm(backCenter.y - 3)}" font-size="4.8" font-weight="600" text-anchor="middle">PASTEDOWN</text>
    <text x="${fmtMm(backX + backPocket.pocketWidthMm * 1.5)}" y="${fmtMm(backCenter.y + 4)}" font-size="3.8" text-anchor="middle">${escapeXml(pocketDim)}</text>`
    : `    <text x="${fmtMm(backCenter.x)}" y="${fmtMm(backCenter.y - 4)}" font-size="5.2" font-weight="600" text-anchor="middle">BACK POCKET</text>
    <text x="${fmtMm(backCenter.x)}" y="${fmtMm(backCenter.y + 3)}" font-size="4" text-anchor="middle">${escapeXml(pocketDim)}</text>
    <text x="${fmtMm(backCenter.x)}" y="${fmtMm(backCenter.y + 10)}" font-size="3.5" fill="#00AA44" text-anchor="middle">OPEN EDGE: RIGHT (SPINE)</text>${buildPocketInsetNote(backPocket, backCenter.x, backCenter.y)}`;

  const frontPieceNotes = isFoldedEndpapers
    ? `    <text x="${fmtMm(frontCenter.x)}" y="${fmtMm(piecesTopY + 12)}" font-size="4.8" font-weight="600" text-anchor="middle">FRONT FOLDED ENDPAPER</text>
    <text x="${fmtMm(frontCenter.x)}" y="${fmtMm(piecesTopY + 18)}" font-size="3.6" fill="#555555" text-anchor="middle">${escapeXml(sheetDim)}</text>
    <text x="${fmtMm(frontX + frontPocket.pocketWidthMm * 0.5)}" y="${fmtMm(frontCenter.y - 3)}" font-size="4.8" font-weight="600" text-anchor="middle">PASTEDOWN</text>
    <text x="${fmtMm(frontX + frontPocket.pocketWidthMm * 0.5)}" y="${fmtMm(frontCenter.y + 4)}" font-size="3.8" text-anchor="middle">${escapeXml(pocketDim)}</text>
    <text x="${fmtMm(frontX + frontPocket.pocketWidthMm * 1.5)}" y="${fmtMm(frontCenter.y - 3)}" font-size="4.8" font-weight="600" text-anchor="middle">FLYLEAF</text>
    <text x="${fmtMm(frontX + frontPocket.pocketWidthMm * 1.5)}" y="${fmtMm(frontCenter.y + 4)}" font-size="3.8" text-anchor="middle">${escapeXml(pocketDim)}</text>`
    : `    <text x="${fmtMm(frontCenter.x)}" y="${fmtMm(frontCenter.y - 4)}" font-size="5.2" font-weight="600" text-anchor="middle">FRONT POCKET</text>
    <text x="${fmtMm(frontCenter.x)}" y="${fmtMm(frontCenter.y + 3)}" font-size="4" text-anchor="middle">${escapeXml(pocketDim)}</text>
    <text x="${fmtMm(frontCenter.x)}" y="${fmtMm(frontCenter.y + 10)}" font-size="3.5" fill="#00AA44" text-anchor="middle">OPEN EDGE: LEFT (SPINE)</text>${buildPocketInsetNote(frontPocket, frontCenter.x, frontCenter.y)}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${fmtMm(contentW)}mm"
     height="${fmtMm(totalH)}mm"
     viewBox="0 0 ${fmtMm(contentW)} ${fmtMm(totalH)}">
  <title>${svgTitle}</title>
  <g id="glue-flaps" fill="#e6dccb" fill-opacity="0.65" stroke="none">
    ${glueFlapPaths}
  </g>
  <g id="cut-lines" fill="none" stroke="#FF0000" stroke-width="0.4">
    ${cutPaths}
  </g>
  <g id="score-lines" fill="none" stroke="#0066FF" stroke-width="0.35" stroke-dasharray="4 2">
    ${scoreLines}
  </g>
  <g id="dimensions-notes" font-family="sans-serif" fill="#222222">
    <rect x="${fmtMm(pad)}" y="${fmtMm(pad)}" width="50" height="50" fill="none" stroke="#222222" stroke-width="0.5" data-label="50x50mm Calibration Square" />
    <text x="${fmtMm(pad + 25)}" y="${fmtMm(pad + 22)}" font-size="4.5" font-weight="600" text-anchor="middle">50 × 50 mm</text>
    <text x="${fmtMm(pad + 25)}" y="${fmtMm(pad + 30)}" font-size="3.4" text-anchor="middle">50 mm Scale Check</text>
    <text x="${fmtMm(pad + 58)}" y="${fmtMm(pad + 18)}" font-size="5" font-weight="700">${headerTitle}</text>
    <text x="${fmtMm(pad + 58)}" y="${fmtMm(pad + 27)}" font-size="3.8" fill="#555555">${legendLine}</text>
${backPieceNotes}
    <text x="${fmtMm(linerCenter.x)}" y="${fmtMm(linerCenter.y - 3)}" font-size="4.8" font-weight="600" text-anchor="middle">SPINE LINER</text>
    <text x="${fmtMm(linerCenter.x)}" y="${fmtMm(linerCenter.y + 4)}" font-size="3.8" text-anchor="middle">${escapeXml(linerDim)}</text>
${frontPieceNotes}
  </g>
</svg>
`;
}
