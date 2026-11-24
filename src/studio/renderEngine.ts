export { hexToRgb01 } from '@/lib/color';
export {
  buildLayerFlipTransform,
  buildPointFlipTransform,
  computeCoverTextLinePlacements,
  computeSpineTextPlacements,
  computeStudioCanvasSpec,
  getCoverTextAxisAlignedBounds,
  inferZoneFromCenterX,
  resolveQuickFitRect,
  resolveZoneClipRect,
  type CoverTextLinePlacement,
  type SpineTextPlacement,
  type StudioCanvasSpec,
} from './canvasSpec';
export { generateAffinityCoverSvg } from './exporters/coverAffinitySvgExporter';
export {
  generatePrintReadyRollPdf,
  type CoverPdfLayerMode,
  type PrintReadyCoverPdfOptions,
} from './exporters/coverPdfExporter';
export { exportCoverPng300Dpi, renderCoverArtworkCanvas } from './exporters/coverRasterExporter';
