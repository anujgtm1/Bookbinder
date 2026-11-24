import type { BindingStyle } from '@/types/bookParams';

export interface BindingStyleIconProps {
  readonly style: BindingStyle;
  readonly className?: string;
  readonly showLabel?: boolean;
}

/**
 * Architectural cross-section mini-diagrams for the 5 Bookbinder Studio binding structures.
 * Driven by an exhaustive BindingStyle map (Open/Closed with zero scattered conditionals).
 */
const STYLE_SHORT_LABELS: Record<BindingStyle, string> = {
  'rigid-case': 'Rigid',
  'flexible-spine': 'Flex',
  'softcover-jacket': 'Slip',
  'dust-jacket': 'Jacket',
  'paperback-wrap': 'Flush',
};

export function BindingStyleIcon({
  style,
  className = 'h-6 w-10',
  showLabel = false,
}: BindingStyleIconProps) {
  return (
    <>
      <svg viewBox="0 0 44 26" fill="none" aria-hidden="true" className={className}>
      {style === 'rigid-case' && (
        <>
          {/* Outer cloth turn-in envelope */}
          <rect
            x="2"
            y="4"
            width="40"
            height="18"
            rx="1"
            stroke="currentColor"
            strokeOpacity="0.45"
            strokeWidth="1"
            strokeDasharray="2 1.5"
          />
          {/* Back board, rigid spine strip, front board */}
          <rect x="5" y="7" width="12" height="12" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.2" />
          <rect x="20" y="7" width="4" height="12" fill="var(--vermilion)" fillOpacity="0.22" stroke="var(--vermilion)" strokeWidth="1.2" />
          <rect x="27" y="7" width="12" height="12" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.2" />
          {/* Hinge gap indicators */}
          <line x1="18.5" y1="5.5" x2="18.5" y2="20.5" stroke="var(--brass)" strokeWidth="1" />
          <line x1="25.5" y1="5.5" x2="25.5" y2="20.5" stroke="var(--brass)" strokeWidth="1" />
        </>
      )}

      {style === 'flexible-spine' && (
        <>
          {/* Outer cloth envelope */}
          <rect
            x="2"
            y="4"
            width="40"
            height="18"
            rx="1"
            stroke="currentColor"
            strokeOpacity="0.45"
            strokeWidth="1"
            strokeDasharray="2 1.5"
          />
          {/* Left & Right boards with open flex arch in center */}
          <rect x="5" y="7" width="13" height="12" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.2" />
          <rect x="26" y="7" width="13" height="12" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.2" />
          <path
            d="M18 13 Q22 7 26 13"
            stroke="var(--vermilion)"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <path
            d="M18 16 Q22 10 26 16"
            stroke="var(--brass)"
            strokeWidth="1"
            strokeDasharray="1.5 1.5"
          />
        </>
      )}

      {style === 'softcover-jacket' && (
        <>
          {/* 4 wrap-over mitered glue tabs on top & bottom */}
          <polygon points="8,7 10,3 17,3 19,7" fill="var(--vermilion)" fillOpacity="0.28" stroke="var(--vermilion)" strokeWidth="0.9" />
          <polygon points="8,19 19,19 17,23 10,23" fill="var(--vermilion)" fillOpacity="0.28" stroke="var(--vermilion)" strokeWidth="0.9" />
          <polygon points="25,7 27,3 34,3 36,7" fill="var(--vermilion)" fillOpacity="0.28" stroke="var(--vermilion)" strokeWidth="0.9" />
          <polygon points="25,19 36,19 34,23 27,23" fill="var(--vermilion)" fillOpacity="0.28" stroke="var(--vermilion)" strokeWidth="0.9" />
          {/* Main jacket body + left/right slip flaps */}
          <rect x="3" y="7" width="38" height="12" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeWidth="1.2" />
          <line x1="8" y1="7" x2="8" y2="19" stroke="var(--brass)" strokeWidth="1" strokeDasharray="2 1.5" />
          <line x1="36" y1="7" x2="36" y2="19" stroke="var(--brass)" strokeWidth="1" strokeDasharray="2 1.5" />
          <line x1="20" y1="7" x2="20" y2="19" stroke="currentColor" strokeOpacity="0.6" strokeWidth="0.9" />
          <line x1="24" y1="7" x2="24" y2="19" stroke="currentColor" strokeOpacity="0.6" strokeWidth="0.9" />
        </>
      )}

      {style === 'dust-jacket' && (
        <>
          {/* Clean flat dust jacket sheet with 4 vertical score folds */}
          <rect x="2" y="5" width="40" height="16" fill="currentColor" fillOpacity="0.09" stroke="currentColor" strokeWidth="1.2" />
          <rect x="2" y="5" width="7" height="16" fill="var(--brass)" fillOpacity="0.2" />
          <rect x="35" y="5" width="7" height="16" fill="var(--brass)" fillOpacity="0.2" />
          <line x1="9" y1="5" x2="9" y2="21" stroke="var(--vermilion)" strokeWidth="1.1" strokeDasharray="2 1.5" />
          <line x1="20" y1="5" x2="20" y2="21" stroke="var(--vermilion)" strokeWidth="1.1" strokeDasharray="2 1.5" />
          <line x1="24" y1="5" x2="24" y2="21" stroke="var(--vermilion)" strokeWidth="1.1" strokeDasharray="2 1.5" />
          <line x1="35" y1="5" x2="35" y2="21" stroke="var(--vermilion)" strokeWidth="1.1" strokeDasharray="2 1.5" />
        </>
      )}

      {style === 'paperback-wrap' && (
        <>
          {/* Flush 3-panel replacement cover with 2 spine score lines */}
          <rect x="5" y="5" width="34" height="16" fill="currentColor" fillOpacity="0.11" stroke="currentColor" strokeWidth="1.2" />
          <rect x="19.5" y="5" width="5" height="16" fill="var(--vermilion)" fillOpacity="0.18" />
          <line x1="19.5" y1="5" x2="19.5" y2="21" stroke="var(--vermilion)" strokeWidth="1.2" strokeDasharray="2 1.5" />
          <line x1="24.5" y1="5" x2="24.5" y2="21" stroke="var(--vermilion)" strokeWidth="1.2" strokeDasharray="2 1.5" />
        </>
      )}
      </svg>
      {showLabel && (
        <span className="font-mono text-[9px] font-medium leading-none tracking-tight">
          {STYLE_SHORT_LABELS[style]}
        </span>
      )}
    </>
  );
}
