import { escapeXml } from '@/lib/utils';
import type { SplitMode } from '@/types/bookParams';
import { GeometryPrimitives, type CaseGeometry, type Rect2D } from '@/types/geometry';
import { roundTo } from '@/types/units';

const SPLIT_PANEL_GAP_MM = 12;

function fmt(value: number): string {
  return String(roundTo(value, 3));
}

function svgRect(rect: Rect2D, attrs: string): string {
  return `<rect x="${fmt(rect.x)}" y="${fmt(rect.y)}" width="${fmt(rect.width)}" height="${fmt(rect.height)}" ${attrs} />`;
}

function renderSinglePieceSvg(geometry: CaseGeometry): string {
  const { outerWrap, cutList } = geometry;
  const bleed = outerWrap.includeBleed ? outerWrap.bleedMm : 0;
  const totalWidth = roundTo(outerWrap.widthMm + bleed * 2, 3);
  const totalHeight = roundTo(outerWrap.heightMm + bleed * 2, 3);
  const viewBox = `${fmt(-bleed)} ${fmt(-bleed)} ${fmt(totalWidth)} ${fmt(totalHeight)}`;

  const cutPath = GeometryPrimitives.polygonToSvgPath(outerWrap.outerCutPolygon, 3);

  const bleedGroup =
    bleed > 0
      ? `  <g id="bleed-box" fill="none" stroke="#00AA44" stroke-width="0.35" stroke-dasharray="3 2">
    ${svgRect(outerWrap.bleedRect, `data-label="Bleed (${fmt(bleed)} mm)"`)}
  </g>`
      : `  <g id="bleed-box" />`;

  const boardGuides = [
    svgRect(outerWrap.backBoardRect, 'data-label="Back Board"'),
    svgRect(outerWrap.spineRect, 'data-label="Spine Strip"'),
    svgRect(outerWrap.frontBoardRect, 'data-label="Front Board"'),
  ].join('\n    ');

  const hingeGuides = [
    svgRect(outerWrap.leftHingeRect, 'stroke-dasharray="1.5 1.5" stroke-opacity="0.7" data-label="Left Hinge"'),
    svgRect(outerWrap.rightHingeRect, 'stroke-dasharray="1.5 1.5" stroke-opacity="0.7" data-label="Right Hinge"'),
  ].join('\n    ');

  const backCenter = GeometryPrimitives.rectCenter(outerWrap.backBoardRect);
  const spineCenter = GeometryPrimitives.rectCenter(outerWrap.spineRect);
  const frontCenter = GeometryPrimitives.rectCenter(outerWrap.frontBoardRect);
  const leftHingeCenter = GeometryPrimitives.rectCenter(outerWrap.leftHingeRect);
  const rightHingeCenter = GeometryPrimitives.rectCenter(outerWrap.rightHingeRect);

  const boardDim = `${roundTo(cutList.coverBoards.widthMm, 1)} × ${roundTo(cutList.coverBoards.heightMm, 1)} mm`;
  const spineDim = `${roundTo(cutList.spineStrip.widthMm, 1)} × ${roundTo(cutList.spineStrip.heightMm, 1)} mm`;
  const wrapDim = `${roundTo(outerWrap.widthMm, 1)} × ${roundTo(outerWrap.heightMm, 1)} mm`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${fmt(totalWidth)}mm"
     height="${fmt(totalHeight)}mm"
     viewBox="${viewBox}">
  <title>Outer Case Wrap — ${escapeXml(wrapDim)} (1:1 mm)</title>
${bleedGroup}
  <g id="cut-lines" fill="none" stroke="#FF0000" stroke-width="0.4">
    <path d="${cutPath}" data-label="Outer Case Wrap Cut Polygon" />
  </g>
  <g id="board-guides" fill="none" stroke="#0066FF" stroke-width="0.35" stroke-dasharray="4 2">
    ${boardGuides}
    ${hingeGuides}
  </g>
  <g id="dimensions-notes" font-family="sans-serif" fill="#0066FF" text-anchor="middle" dominant-baseline="middle">
    <text x="${fmt(backCenter.x)}" y="${fmt(backCenter.y - 4)}" font-size="6" font-weight="600">BACK BOARD</text>
    <text x="${fmt(backCenter.x)}" y="${fmt(backCenter.y + 4)}" font-size="4.5">${escapeXml(boardDim)}</text>
    <text x="${fmt(frontCenter.x)}" y="${fmt(frontCenter.y - 4)}" font-size="6" font-weight="600">FRONT BOARD</text>
    <text x="${fmt(frontCenter.x)}" y="${fmt(frontCenter.y + 4)}" font-size="4.5">${escapeXml(boardDim)}</text>
    <text x="${fmt(spineCenter.x)}" y="${fmt(spineCenter.y)}" font-size="4.2" font-weight="600" transform="rotate(-90 ${fmt(spineCenter.x)} ${fmt(spineCenter.y)})">SPINE ${escapeXml(spineDim)}</text>
    <text x="${fmt(leftHingeCenter.x)}" y="${fmt(leftHingeCenter.y)}" font-size="3.2" transform="rotate(-90 ${fmt(leftHingeCenter.x)} ${fmt(leftHingeCenter.y)})">HINGE ${fmt(cutList.hingeSpacerMm)} mm</text>
    <text x="${fmt(rightHingeCenter.x)}" y="${fmt(rightHingeCenter.y)}" font-size="3.2" transform="rotate(-90 ${fmt(rightHingeCenter.x)} ${fmt(rightHingeCenter.y)})">HINGE ${fmt(cutList.hingeSpacerMm)} mm</text>
    <text x="${fmt(outerWrap.widthMm / 2)}" y="${fmt(outerWrap.turnInMm / 2)}" font-size="3.6" fill="#444444">Outer Wrap ${escapeXml(wrapDim)} • Turn-In ${fmt(outerWrap.turnInMm)} mm • 45° Miter Clearance ${fmt(outerWrap.miterGapMm)} mm • Scale 1:1 mm</text>
  </g>
</svg>
`;
}

function renderThreePieceSvg(geometry: CaseGeometry): string {
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
  const viewBox = `${fmt(-bleed)} ${fmt(-bleed)} ${fmt(totalWidth)} ${fmt(totalHeight)}`;

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

  const cutElements = positioned
    .map(({ panel, xOffset }) => {
      const shifted = GeometryPrimitives.translatePolygon(panel.cutPolygon, xOffset, 0);
      return `<path d="${GeometryPrimitives.polygonToSvgPath(shifted, 3)}" data-label="${escapeXml(panel.label)}" />`;
    })
    .join('\n    ');

  const guideElements = positioned
    .flatMap(({ panel, xOffset }) =>
      panel.guideRects.map(({ label, rect }) =>
        svgRect(
          { ...rect, x: rect.x + xOffset },
          `data-label="${escapeXml(`${panel.label} — ${label}`)}"`,
        ),
      ),
    )
    .join('\n    ');

  const noteElements = positioned
    .map(({ panel, xOffset }) => {
      const cx = xOffset + panel.widthMm / 2;
      const cy = panel.heightMm / 2;
      const dim = `${roundTo(panel.widthMm, 1)} × ${roundTo(panel.heightMm, 1)} mm`;
      return `    <text x="${fmt(cx)}" y="${fmt(cy - 4)}" font-size="5" font-weight="600">${escapeXml(panel.label.toUpperCase())}</text>
    <text x="${fmt(cx)}" y="${fmt(cy + 4)}" font-size="4">${escapeXml(dim)}</text>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${fmt(totalWidth)}mm"
     height="${fmt(totalHeight)}mm"
     viewBox="${viewBox}">
  <title>Outer Case Wrap — 3-Piece Quarter-Bound Split (1:1 mm)</title>
  <g id="bleed-box" fill="none" stroke="#00AA44" stroke-width="0.35" stroke-dasharray="3 2">
    ${bleedElements}
  </g>
  <g id="cut-lines" fill="none" stroke="#FF0000" stroke-width="0.4">
    ${cutElements}
  </g>
  <g id="board-guides" fill="none" stroke="#0066FF" stroke-width="0.35" stroke-dasharray="4 2">
    ${guideElements}
  </g>
  <g id="dimensions-notes" font-family="sans-serif" fill="#0066FF" text-anchor="middle" dominant-baseline="middle">
${noteElements}
  </g>
</svg>
`;
}

export function generateOuterWrapSvg(geometry: CaseGeometry, splitMode: SplitMode): string {
  return splitMode === 'three-piece'
    ? renderThreePieceSvg(geometry)
    : renderSinglePieceSvg(geometry);
}

/**
 * Generates an exact 1:1 physical mm SVG of Back Pocket, Spine Liner, Front Pocket,
 * and a 50 × 50 mm calibration square organized into named Affinity / cutter layers.
 */
export function generateInnerTemplatesSvg(geometry: CaseGeometry): string {
  const { backPocket, spineLiner, frontPocket } = geometry;
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
    `<path d="${shiftPoly(backPocket.outerCutPolygon, backX, piecesTopY)}" data-label="Back Pocket Envelope" />`,
    svgRect(
      { x: linerX, y: linerY, width: spineLiner.widthMm, height: spineLiner.heightMm },
      'data-label="Spine Reinforcement Liner"',
    ),
    `<path d="${shiftPoly(frontPocket.outerCutPolygon, frontX, piecesTopY)}" data-label="Front Pocket Envelope" />`,
  ].join('\n    ');

  const scoreLines = [
    ...backPocket.scoreLines.map(
      (l) =>
        `<line x1="${fmt(l.x1 + backX)}" y1="${fmt(l.y1 + piecesTopY)}" x2="${fmt(l.x2 + backX)}" y2="${fmt(l.y2 + piecesTopY)}" />`,
    ),
    ...spineLiner.scoreLines.map(
      (l) =>
        `<line x1="${fmt(l.x1 + linerX)}" y1="${fmt(l.y1 + linerY)}" x2="${fmt(l.x2 + linerX)}" y2="${fmt(l.y2 + linerY)}" />`,
    ),
    ...frontPocket.scoreLines.map(
      (l) =>
        `<line x1="${fmt(l.x1 + frontX)}" y1="${fmt(l.y1 + piecesTopY)}" x2="${fmt(l.x2 + frontX)}" y2="${fmt(l.y2 + piecesTopY)}" />`,
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
  const linerDim = `${roundTo(spineLiner.widthMm, 1)} × ${roundTo(spineLiner.heightMm, 1)} mm`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${fmt(contentW)}mm"
     height="${fmt(totalH)}mm"
     viewBox="0 0 ${fmt(contentW)} ${fmt(totalH)}">
  <title>Inner Pockets &amp; Spine Liner — 1:1 mm Vector Templates</title>
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
    <rect x="${fmt(pad)}" y="${fmt(pad)}" width="50" height="50" fill="none" stroke="#222222" stroke-width="0.5" data-label="50x50mm Calibration Square" />
    <text x="${fmt(pad + 25)}" y="${fmt(pad + 22)}" font-size="4.5" font-weight="600" text-anchor="middle">50 × 50 mm</text>
    <text x="${fmt(pad + 25)}" y="${fmt(pad + 30)}" font-size="3.4" text-anchor="middle">Verify 1:1 Scale</text>
    <text x="${fmt(pad + 58)}" y="${fmt(pad + 18)}" font-size="5" font-weight="700">INNER POCKETS &amp; SPINE LINER (1:1 mm)</text>
    <text x="${fmt(pad + 58)}" y="${fmt(pad + 27)}" font-size="3.8" fill="#555555">Solid Red = Cut • Dashed Blue = Score &amp; Fold • Shaded = Apply Glue Here</text>
    <text x="${fmt(backCenter.x)}" y="${fmt(backCenter.y - 4)}" font-size="5.2" font-weight="600" text-anchor="middle">BACK POCKET</text>
    <text x="${fmt(backCenter.x)}" y="${fmt(backCenter.y + 3)}" font-size="4" text-anchor="middle">${escapeXml(pocketDim)}</text>
    <text x="${fmt(backCenter.x)}" y="${fmt(backCenter.y + 10)}" font-size="3.5" fill="#00AA44" text-anchor="middle">OPEN EDGE: RIGHT (SPINE)</text>
    <text x="${fmt(linerCenter.x)}" y="${fmt(linerCenter.y - 3)}" font-size="4.8" font-weight="600" text-anchor="middle">SPINE LINER</text>
    <text x="${fmt(linerCenter.x)}" y="${fmt(linerCenter.y + 4)}" font-size="3.8" text-anchor="middle">${escapeXml(linerDim)}</text>
    <text x="${fmt(frontCenter.x)}" y="${fmt(frontCenter.y - 4)}" font-size="5.2" font-weight="600" text-anchor="middle">FRONT POCKET</text>
    <text x="${fmt(frontCenter.x)}" y="${fmt(frontCenter.y + 3)}" font-size="4" text-anchor="middle">${escapeXml(pocketDim)}</text>
    <text x="${fmt(frontCenter.x)}" y="${fmt(frontCenter.y + 10)}" font-size="3.5" fill="#00AA44" text-anchor="middle">OPEN EDGE: LEFT (SPINE)</text>
  </g>
</svg>
`;
}
