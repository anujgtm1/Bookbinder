import { clampFinite, roundTo } from './units';

export type LayoutAnchorZone = 'front' | 'back' | 'spine' | 'fullWrap';

export type HorizontalPin =
  | { readonly kind: 'free' }
  | { readonly kind: 'center' }
  | { readonly kind: 'inset-both'; readonly marginMm: number };

export type VerticalPin =
  | { readonly kind: 'free' }
  | { readonly kind: 'center' }
  | { readonly kind: 'top-third' }
  | { readonly kind: 'bottom-third' }
  | { readonly kind: 'inset-both'; readonly marginMm: number };

export type ImageFitConstraint = 'free' | 'cover' | 'contain';

export type CoverTextSemanticRole = 'title' | 'subtitle' | 'author' | 'blurb';

export interface LayerLayoutConstraint {
  readonly anchorZone?: LayoutAnchorZone;
  readonly horizontal?: HorizontalPin;
  readonly vertical?: VerticalPin;
  readonly imageFit?: ImageFitConstraint;
}

export const LAYOUT_CONSTRAINT_BOUNDS = {
  marginMm: { min: 0, max: 100 },
} as const;

const VALID_ANCHOR_ZONES: readonly LayoutAnchorZone[] = ['front', 'back', 'spine', 'fullWrap'];
const VALID_TEXT_ROLES: readonly CoverTextSemanticRole[] = ['title', 'subtitle', 'author', 'blurb'];

function parseAnchorZone(raw: unknown): LayoutAnchorZone | undefined {
  if (typeof raw === 'string' && (VALID_ANCHOR_ZONES as readonly string[]).includes(raw)) {
    return raw as LayoutAnchorZone;
  }
  return undefined;
}

function parseHorizontalPin(raw: unknown): HorizontalPin | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  if (obj.kind === 'center') {
    return { kind: 'center' };
  }
  if (obj.kind === 'inset-both') {
    const marginMm = roundTo(
      clampFinite(
        obj.marginMm,
        12,
        LAYOUT_CONSTRAINT_BOUNDS.marginMm.min,
        LAYOUT_CONSTRAINT_BOUNDS.marginMm.max,
      ),
      2,
    );
    return { kind: 'inset-both', marginMm };
  }
  return undefined;
}

function parseVerticalPin(raw: unknown): VerticalPin | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  if (obj.kind === 'center' || obj.kind === 'top-third' || obj.kind === 'bottom-third') {
    return { kind: obj.kind };
  }
  if (obj.kind === 'inset-both') {
    const marginMm = roundTo(
      clampFinite(
        obj.marginMm,
        12,
        LAYOUT_CONSTRAINT_BOUNDS.marginMm.min,
        LAYOUT_CONSTRAINT_BOUNDS.marginMm.max,
      ),
      2,
    );
    return { kind: 'inset-both', marginMm };
  }
  return undefined;
}

function parseImageFit(raw: unknown): ImageFitConstraint | undefined {
  if (raw === 'cover' || raw === 'contain') {
    return raw;
  }
  return undefined;
}

export function sanitizeCoverTextRole(raw: unknown): CoverTextSemanticRole | undefined {
  if (typeof raw === 'string' && (VALID_TEXT_ROLES as readonly string[]).includes(raw)) {
    return raw as CoverTextSemanticRole;
  }
  return undefined;
}

/**
 * Validates and normalizes an untrusted layout constraint payload into a compact JSON-serializable
 * object. Returns `undefined` when no active pin or image-fit condition is present.
 */
export function sanitizeLayerLayoutConstraint(raw: unknown): LayerLayoutConstraint | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;

  const anchorZone = parseAnchorZone(obj.anchorZone);
  const horizontal = parseHorizontalPin(obj.horizontal);
  const vertical = parseVerticalPin(obj.vertical);
  const imageFit = parseImageFit(obj.imageFit);

  if (!horizontal && !vertical && !imageFit) {
    return undefined;
  }

  return {
    ...(anchorZone ? { anchorZone } : {}),
    ...(horizontal ? { horizontal } : {}),
    ...(vertical ? { vertical } : {}),
    ...(imageFit ? { imageFit } : {}),
  };
}

/** Deep-clones an active layout constraint for clean serialization; returns `undefined` if inactive. */
export function cloneLayerLayoutConstraint(
  constraint?: LayerLayoutConstraint | null,
): LayerLayoutConstraint | undefined {
  return sanitizeLayerLayoutConstraint(constraint);
}

/** Returns true when at least one horizontal pin, vertical pin, or image fit condition is active. */
export function hasActiveLayoutConstraint(constraint?: LayerLayoutConstraint | null): boolean {
  if (!constraint) return false;
  const hasH = Boolean(constraint.horizontal && constraint.horizontal.kind !== 'free');
  const hasV = Boolean(constraint.vertical && constraint.vertical.kind !== 'free');
  const hasFit = Boolean(constraint.imageFit && constraint.imageFit !== 'free');
  return hasH || hasV || hasFit;
}

/**
 * Auto-detaches only the axes that moved during a manual drag or keyboard nudge,
 * preserving unmoved pinned axes (e.g. dragging vertically along a center guide keeps
 * `horizontal: center` pinned while detaching `vertical` and any `imageFit`).
 */
export function detachConstraintOnMove(
  constraint: LayerLayoutConstraint | undefined,
  movedX: boolean,
  movedY: boolean,
): LayerLayoutConstraint | undefined {
  if (!constraint || (!movedX && !movedY)) {
    return sanitizeLayerLayoutConstraint(constraint);
  }
  return sanitizeLayerLayoutConstraint({
    anchorZone: constraint.anchorZone,
    horizontal: movedX ? undefined : constraint.horizontal,
    vertical: movedY ? undefined : constraint.vertical,
    imageFit: undefined,
  });
}

/**
 * Auto-detaches size-coupled conditions (`inset-both` margins and `imageFit`) when the user
 * manually resizes or zooms an element so it never snaps back on future book resizes.
 */
export function detachConstraintOnResize(
  constraint: LayerLayoutConstraint | undefined,
): LayerLayoutConstraint | undefined {
  if (!constraint) return undefined;
  const horizontal =
    constraint.horizontal?.kind === 'inset-both' ? undefined : constraint.horizontal;
  const vertical =
    constraint.vertical?.kind === 'inset-both' ? undefined : constraint.vertical;
  return sanitizeLayerLayoutConstraint({
    anchorZone: constraint.anchorZone,
    horizontal,
    vertical,
    imageFit: undefined,
  });
}

function formatAnchorZoneLabel(zone?: LayoutAnchorZone): string | null {
  switch (zone) {
    case 'front':
      return 'Front';
    case 'back':
      return 'Back';
    case 'spine':
      return 'Spine';
    case 'fullWrap':
      return 'Full Wrap';
    default:
      return null;
  }
}

/** Returns a concise human-readable summary of an active layout constraint, or `null` if free. */
export function describeLayoutConstraint(
  constraint?: LayerLayoutConstraint | null,
): string | null {
  if (!hasActiveLayoutConstraint(constraint) || !constraint) {
    return null;
  }

  const zoneLabel = formatAnchorZoneLabel(constraint.anchorZone);
  const parts: string[] = [];

  if (constraint.imageFit === 'cover') {
    parts.push('Fit Cover');
  } else if (constraint.imageFit === 'contain') {
    parts.push('Fit Inside');
  } else if (
    constraint.horizontal?.kind === 'inset-both' &&
    constraint.vertical?.kind === 'inset-both' &&
    Math.abs(constraint.horizontal.marginMm - constraint.vertical.marginMm) < 0.05
  ) {
    parts.push(`${roundTo(constraint.horizontal.marginMm, 1)} mm margin`);
  } else {
    const h = constraint.horizontal;
    const v = constraint.vertical;
    if (h?.kind === 'center' && v?.kind === 'center') {
      parts.push('Center');
    } else if (h?.kind === 'center' && v?.kind === 'top-third') {
      parts.push('Top ⅓');
    } else if (h?.kind === 'center' && v?.kind === 'bottom-third') {
      parts.push('Bottom ⅓');
    } else {
      if (h?.kind === 'center') parts.push('Centered X');
      else if (h?.kind === 'inset-both') parts.push(`${roundTo(h.marginMm, 1)} mm X margin`);

      if (v?.kind === 'center') parts.push('Centered Y');
      else if (v?.kind === 'top-third') parts.push('Top ⅓');
      else if (v?.kind === 'bottom-third') parts.push('Bottom ⅓');
      else if (v?.kind === 'inset-both') parts.push(`${roundTo(v.marginMm, 1)} mm Y margin`);
    }
  }

  const detail = parts.join(', ');
  return zoneLabel ? `${zoneLabel} · ${detail}` : detail;
}
