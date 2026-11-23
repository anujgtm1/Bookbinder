import { escapeXml, fmtMm } from '@/lib/svgFormat';
import { GeometryPrimitives, type CaseGeometry } from '@/types/geometry';
import type { CoverStudioState } from '@/types/studio';
import { PRINT_DPI, UnitConverter } from '@/types/units';
import {
  buildPointFlipTransform,
  computeCoverTextLinePlacements,
  computeSpineTextPlacements,
  computeStudioCanvasSpec,
} from '../canvasSpec';
import { buildOrnamentCompoundPath, getOrnamentSvgStyle } from '../classicOrnaments';
import { resolveFontCssFamily, type CustomFontAsset } from '../fonts';

/**
 * Affinity Round-Trip 1:1 mm SVG Export (`outer_cover_300dpi.svg`):
 * Embeds the 300 DPI composed artwork layer + editable native vector spine typography +
 * Affinity-ready `cut-lines` and `board-guides` groups.
 */
export function generateAffinityCoverSvg(
  geometry: CaseGeometry,
  studio: CoverStudioState,
  customFont: CustomFontAsset | null,
  artworkPngDataUrl?: string,
): string {
  const spec = computeStudioCanvasSpec(geometry, PRINT_DPI);
  const { outerWrap } = geometry;
  const bleed = spec.bleedMm;

  const shiftedCutPoly = GeometryPrimitives.translatePolygon(
    outerWrap.outerCutPolygon,
    bleed,
    bleed,
  );
  const cutPath = GeometryPrimitives.polygonToSvgPath(shiftedCutPoly, 3);

  const fontFamily = escapeXml(resolveFontCssFamily(studio.spineText.fontId, customFont));
  const textPlacements = computeSpineTextPlacements(geometry, studio);

  const artworkLayer = artworkPngDataUrl
    ? `    <image x="0" y="0" width="${fmtMm(spec.totalWidthMm)}" height="${fmtMm(spec.totalHeightMm)}" href="${artworkPngDataUrl}" preserveAspectRatio="none" />`
    : `    <rect x="${fmtMm(spec.backZoneRect.x)}" y="0" width="${fmtMm(spec.backZoneRect.width)}" height="${fmtMm(spec.totalHeightMm)}" fill="${studio.backBgColor}" />
    <rect x="${fmtMm(spec.spineZoneRect.x)}" y="0" width="${fmtMm(spec.spineZoneRect.width)}" height="${fmtMm(spec.totalHeightMm)}" fill="${studio.spineBgColor}" />
    <rect x="${fmtMm(spec.frontZoneRect.x)}" y="0" width="${fmtMm(spec.frontZoneRect.width)}" height="${fmtMm(spec.totalHeightMm)}" fill="${studio.frontBgColor}" />`;

  const ornamentNodes = (studio.ornaments ?? [])
    .map((orn) => {
      const d = buildOrnamentCompoundPath(orn);
      if (!d) return '';
      const style = getOrnamentSvgStyle(orn);
      const strokeAttrs =
        style.stroke !== 'none' && style.strokeWidthMm > 0
          ? ` stroke="${escapeXml(style.stroke)}" stroke-width="${fmtMm(style.strokeWidthMm)}" stroke-linejoin="round" stroke-linecap="round"`
          : '';
      return `    <path d="${d}" fill="${escapeXml(style.fill)}"${strokeAttrs} />`;
    })
    .filter(Boolean)
    .join('\n');

  const coverTextNodes = (studio.textLayers ?? [])
    .map((layer) => {
      const layerFont = escapeXml(resolveFontCssFamily(layer.fontId, customFont));
      const anchor = layer.align === 'left' ? 'start' : layer.align === 'right' ? 'end' : 'middle';
      const flipTransform = buildPointFlipTransform(layer.xMm, layer.yMm, layer.flipX, layer.flipY);
      const indent = flipTransform ? '      ' : '    ';
      const lines = computeCoverTextLinePlacements(layer)
        .filter((item) => item.text.trim().length > 0)
        .map((item) => {
          const fontSizeMm = UnitConverter.pointsToMm(item.fontSizePt);
          const trackingAttr =
            Math.abs(item.letterSpacingEm) > 0.001
              ? ` letter-spacing="${fmtMm(item.letterSpacingEm)}em"`
              : '';
          return `${indent}<text x="${fmtMm(item.anchorXMm)}" y="${fmtMm(item.anchorYMm)}" font-family="${layerFont}" font-size="${fmtMm(fontSizeMm)}"${trackingAttr} fill="${escapeXml(item.color)}" text-anchor="${anchor}" dominant-baseline="middle">${escapeXml(item.text)}</text>`;
        });
      if (lines.length === 0) return '';
      if (flipTransform) {
        return `    <g transform="${flipTransform}">\n${lines.join('\n')}\n    </g>`;
      }
      return lines.join('\n');
    })
    .filter(Boolean)
    .join('\n');

  const textNodes = textPlacements
    .map((item) => {
      const fontSizeMm = UnitConverter.pointsToMm(item.fontSizePt);
      return `    <text x="${fmtMm(item.anchorXMm)}" y="${fmtMm(item.anchorYMm)}" font-family="${fontFamily}" font-size="${fmtMm(fontSizeMm)}" fill="${studio.spineText.textColor}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${item.rotationDegCss} ${fmtMm(item.anchorXMm)} ${fmtMm(item.anchorYMm)})">${escapeXml(item.text)}</text>`;
    })
    .join('\n');

  const boardRects = [
    outerWrap.backBoardRect,
    outerWrap.spineRect,
    outerWrap.frontBoardRect,
  ]
    .map(
      (r) =>
        `    <rect x="${fmtMm(r.x + bleed)}" y="${fmtMm(r.y + bleed)}" width="${fmtMm(r.width)}" height="${fmtMm(r.height)}" />`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${fmtMm(spec.totalWidthMm)}mm"
     height="${fmtMm(spec.totalHeightMm)}mm"
     viewBox="0 0 ${fmtMm(spec.totalWidthMm)} ${fmtMm(spec.totalHeightMm)}">
  <title>Composed Outer Cover — Affinity Round-Trip (1:1 mm, 300 DPI)</title>
  <g id="artwork-layer">
${artworkLayer}
  </g>
  <g id="classic-ornaments">
${ornamentNodes}
  </g>
  <g id="cover-typography">
${coverTextNodes}
  </g>
  <g id="spine-typography">
${textNodes}
  </g>
  <g id="cut-lines" fill="none" stroke="#FF0000" stroke-width="0.35">
    <path d="${cutPath}" />
  </g>
  <g id="board-guides" fill="none" stroke="#0066FF" stroke-width="0.3" stroke-dasharray="4 2">
${boardRects}
  </g>
</svg>
`;
}
