import type { SplitMode } from '@/types/bookParams';
import { GeometryPrimitives, type CaseGeometry, type Rect2D } from '@/types/geometry';
import { roundTo } from '@/types/units';

const SPLIT_PANEL_GAP_MM = 12;

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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
