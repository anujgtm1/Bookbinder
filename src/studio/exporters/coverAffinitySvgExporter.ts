import { escapeXml, fmtMm } from '@/lib/svgFormat';
import type { CoverOrnamentLayer, CoverTextLayer } from '@/types/coverElements';
import { GeometryPrimitives, type CaseGeometry } from '@/types/geometry';
import type { CoverStudioState } from '@/types/studio';
import type { CoverImageLayer } from '@/types/studioLayer';
import { PRINT_DPI, UnitConverter } from '@/types/units';
import {
  buildLayerFlipTransform,
  buildPointFlipTransform,
  computeCoverTextLinePlacements,
  computeSpineTextPlacements,
  computeStudioCanvasSpec,
} from '../canvasSpec';
import { buildOrnamentCompoundPath, getOrnamentSvgStyle } from '../classicOrnaments';
import { resolveFontCssFamily, type CustomFontAsset } from '../fonts';
import {
  hasCustomCrossTypeOrder,
  hasImageAboveVectorElements,
  resolveOrderedStudioElements,
} from '../layerStack';

function renderImageNode(layer: CoverImageLayer, indent: string): string {
  const transform = buildLayerFlipTransform(
    layer.xMm,
    layer.yMm,
    layer.widthMm,
    layer.heightMm,
    layer.flipX,
    layer.flipY,
    layer.rotationDeg,
  );
  const transformAttr = transform ? ` transform="${escapeXml(transform)}"` : '';
  const clipAttr =
    layer.clipZone !== 'none' ? ` clip-path="url(#affinity-clip-${layer.clipZone})"` : '';
  const scrimNode =
    (layer.dimOpacity ?? 0) > 0
      ? `\n${indent}  <rect x="${fmtMm(layer.xMm)}" y="${fmtMm(layer.yMm)}" width="${fmtMm(layer.widthMm)}" height="${fmtMm(layer.heightMm)}" fill="rgba(10, 12, 16, ${layer.dimOpacity})" />`
      : '';
  return `${indent}<g data-layer-id="${escapeXml(layer.id)}"${clipAttr}>
${indent}  <image x="${fmtMm(layer.xMm)}" y="${fmtMm(layer.yMm)}" width="${fmtMm(layer.widthMm)}" height="${fmtMm(layer.heightMm)}" href="${escapeXml(layer.dataUrl)}" preserveAspectRatio="none"${transformAttr} />${scrimNode}
${indent}</g>`;
}

function renderOrnamentNode(orn: CoverOrnamentLayer, indent: string): string {
  const d = buildOrnamentCompoundPath(orn);
  if (!d) return '';
  const style = getOrnamentSvgStyle(orn);
  const strokeAttrs =
    style.stroke !== 'none' && style.strokeWidthMm > 0
      ? ` stroke="${escapeXml(style.stroke)}" stroke-width="${fmtMm(style.strokeWidthMm)}" stroke-linejoin="round" stroke-linecap="round"`
      : '';
  return `${indent}<path data-ornament-id="${escapeXml(orn.id)}" d="${d}" fill="${escapeXml(style.fill)}"${strokeAttrs} />`;
}

function renderTextNode(
  layer: CoverTextLayer,
  customFont: CustomFontAsset | null,
  indent: string,
): string {
  const layerFont = escapeXml(resolveFontCssFamily(layer.fontId, customFont));
  const anchor = layer.align === 'left' ? 'start' : layer.align === 'right' ? 'end' : 'middle';
  const flipTransform = buildPointFlipTransform(
    layer.xMm,
    layer.yMm,
    layer.flipX,
    layer.flipY,
    layer.rotationDeg,
  );
  const lineIndent = `${indent}  `;
  const lines = computeCoverTextLinePlacements(layer)
    .filter((item) => item.text.trim().length > 0)
    .map((item) => {
      const fontSizeMm = UnitConverter.pointsToMm(item.fontSizePt);
      const trackingAttr =
        Math.abs(item.letterSpacingEm) > 0.001
          ? ` letter-spacing="${fmtMm(item.letterSpacingEm)}em"`
          : '';
      return `${lineIndent}<text x="${fmtMm(item.anchorXMm)}" y="${fmtMm(item.anchorYMm)}" font-family="${layerFont}" font-size="${fmtMm(fontSizeMm)}"${trackingAttr} fill="${escapeXml(item.color)}" text-anchor="${anchor}" dominant-baseline="middle">${escapeXml(item.text)}</text>`;
    });
  if (lines.length === 0) return '';
  const transformAttr = flipTransform ? ` transform="${flipTransform}"` : '';
  return `${indent}<g data-text-id="${escapeXml(layer.id)}"${transformAttr}>\n${lines.join('\n')}\n${indent}</g>`;
}

/**
 * Affinity Round-Trip 1:1 mm SVG Export (`outer_cover_300dpi.svg`):
 * Embeds artwork, ornaments, and editable native vector typography in exact unified
 * `layerOrder` + Affinity-ready `cut-lines` and `board-guides` groups.
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
  const orderedElements = resolveOrderedStudioElements(studio);
  const customCrossTypeOrder = hasCustomCrossTypeOrder(studio);
  const imageAboveVectors = hasImageAboveVectorElements(studio);
  const useFlattenedArtwork = Boolean(artworkPngDataUrl) && !imageAboveVectors;

  const baseRects = `    <rect x="${fmtMm(spec.backZoneRect.x)}" y="0" width="${fmtMm(spec.backZoneRect.width)}" height="${fmtMm(spec.totalHeightMm)}" fill="${studio.backBgColor}" />
    <rect x="${fmtMm(spec.spineZoneRect.x)}" y="0" width="${fmtMm(spec.spineZoneRect.width)}" height="${fmtMm(spec.totalHeightMm)}" fill="${studio.spineBgColor}" />
    <rect x="${fmtMm(spec.frontZoneRect.x)}" y="0" width="${fmtMm(spec.frontZoneRect.width)}" height="${fmtMm(spec.totalHeightMm)}" fill="${studio.frontBgColor}" />`;

  const inlineImagesNeeded =
    !useFlattenedArtwork && orderedElements.some((item) => item.kind === 'image');

  const clipDefs = inlineImagesNeeded
    ? `  <defs>
    <clipPath id="affinity-clip-back">
      <rect x="${fmtMm(spec.backArtworkRect.x)}" y="${fmtMm(spec.backArtworkRect.y)}" width="${fmtMm(spec.backArtworkRect.width)}" height="${fmtMm(spec.backArtworkRect.height)}" />
    </clipPath>
    <clipPath id="affinity-clip-spine">
      <rect x="${fmtMm(spec.spineArtworkRect.x)}" y="${fmtMm(spec.spineArtworkRect.y)}" width="${fmtMm(spec.spineArtworkRect.width)}" height="${fmtMm(spec.spineArtworkRect.height)}" />
    </clipPath>
    <clipPath id="affinity-clip-front">
      <rect x="${fmtMm(spec.frontArtworkRect.x)}" y="${fmtMm(spec.frontArtworkRect.y)}" width="${fmtMm(spec.frontArtworkRect.width)}" height="${fmtMm(spec.frontArtworkRect.height)}" />
    </clipPath>
  </defs>\n`
    : '';

  let contentGroups: string;
  if (customCrossTypeOrder) {
    const artworkLayer = useFlattenedArtwork
      ? `    <image x="0" y="0" width="${fmtMm(spec.totalWidthMm)}" height="${fmtMm(spec.totalHeightMm)}" href="${artworkPngDataUrl}" preserveAspectRatio="none" />`
      : baseRects;

    const unifiedNodes = orderedElements
      .map((item) => {
        if (item.kind === 'image') {
          return useFlattenedArtwork ? '' : renderImageNode(item.layer, '    ');
        }
        if (item.kind === 'ornament') {
          return renderOrnamentNode(item.layer, '    ');
        }
        return renderTextNode(item.layer, customFont, '    ');
      })
      .filter(Boolean)
      .join('\n');

    contentGroups = `  <g id="artwork-layer">
${artworkLayer}
  </g>
  <g id="cover-layers">
${unifiedNodes}
  </g>`;
  } else {
    const inlineImageNodes = inlineImagesNeeded
      ? orderedElements
          .filter((item) => item.kind === 'image')
          .map((item) => renderImageNode(item.layer, '    '))
          .join('\n')
      : '';

    const artworkLayer = useFlattenedArtwork
      ? `    <image x="0" y="0" width="${fmtMm(spec.totalWidthMm)}" height="${fmtMm(spec.totalHeightMm)}" href="${artworkPngDataUrl}" preserveAspectRatio="none" />`
      : inlineImageNodes
        ? `${baseRects}\n${inlineImageNodes}`
        : baseRects;

    const ornamentNodes = orderedElements
      .filter((item) => item.kind === 'ornament')
      .map((item) => renderOrnamentNode(item.layer, '    '))
      .filter(Boolean)
      .join('\n');

    const coverTextNodes = orderedElements
      .filter((item) => item.kind === 'text')
      .map((item) => renderTextNode(item.layer, customFont, '    '))
      .filter(Boolean)
      .join('\n');

    contentGroups = `  <g id="artwork-layer">
${artworkLayer}
  </g>
  <g id="classic-ornaments">
${ornamentNodes}
  </g>
  <g id="cover-typography">
${coverTextNodes}
  </g>`;
  }

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
  <title>Composed Outer Cover — Affinity Round-Trip (300 DPI)</title>
${clipDefs}${contentGroups}
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
