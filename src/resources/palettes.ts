export interface ColorSwatch {
  readonly label: string;
  readonly hex: string;
}

/** Classic metallic foil & ink swatches for cover typography and ornaments. */
export const FOIL_SWATCHES: readonly ColorSwatch[] = [
  { label: 'Antique Gold Foil', hex: '#d9b566' },
  { label: 'Archival Cream', hex: '#f5efe2' },
  { label: 'Silver Foil', hex: '#d4d8de' },
  { label: 'Rose Copper', hex: '#d48b6a' },
  { label: 'Lampblack Ink', hex: '#1f1b16' },
] as const;

/** Archival endpaper & bookcloth swatches for inner pockets and spine liners. */
export const ENDPAPER_SWATCHES: readonly ColorSwatch[] = [
  { label: 'Archival Cream', hex: '#f4eee1' },
  { label: 'Kraft Linen', hex: '#d8cab2' },
  { label: 'Bindery Spruce', hex: '#1e4d44' },
  { label: 'Oxford Navy', hex: '#1f3a52' },
  { label: 'Oxblood Cloth', hex: '#6e2828' },
  { label: 'Antique Sage', hex: '#4f6d5c' },
] as const;
