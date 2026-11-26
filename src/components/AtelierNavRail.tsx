import { BookMarked, FolderOpen, Library, Printer, Ruler, type LucideIcon } from 'lucide-react';
import atelierColophonImg from '@/assets/atelier/atelier-colophon.jpg';

export type WorkspaceTab = 'measure' | 'outer' | 'pockets' | 'series' | 'make';

interface AtelierNavItemSpec {
  readonly id: WorkspaceTab;
  readonly label: string;
  readonly testId: string;
  readonly icon: LucideIcon;
}

interface AtelierNavGroupSpec {
  readonly id: string;
  readonly label: string;
  readonly items: readonly AtelierNavItemSpec[];
}

export const ATELIER_NAV_GROUPS: readonly AtelierNavGroupSpec[] = [
  {
    id: 'bench',
    label: 'Bench',
    items: [
      {
        id: 'measure',
        label: 'Measure',
        testId: 'nav-measure',
        icon: Ruler,
      },
    ],
  },
  {
    id: 'studio',
    label: 'Studio',
    items: [
      {
        id: 'outer',
        label: 'Cover',
        testId: 'nav-outer',
        icon: BookMarked,
      },
      {
        id: 'pockets',
        label: 'Endpapers',
        testId: 'nav-pockets',
        icon: FolderOpen,
      },
      {
        id: 'series',
        label: 'Series',
        testId: 'nav-series',
        icon: Library,
      },
    ],
  },
  {
    id: 'output',
    label: 'Output',
    items: [
      {
        id: 'make',
        label: 'Make & Print',
        testId: 'nav-make',
        icon: Printer,
      },
    ],
  },
] as const;

export interface AtelierNavRailProps {
  readonly activeTab: WorkspaceTab;
  readonly onSelectTab: (tab: WorkspaceTab) => void;
  readonly usesInnerPockets?: boolean;
  readonly pocketsBadgeLabel?: string | null;
}

export function AtelierNavRail({
  activeTab,
  onSelectTab,
  usesInnerPockets = true,
  pocketsBadgeLabel = null,
}: AtelierNavRailProps) {
  return (
    <aside
      aria-label="Atelier Navigation"
      data-testid="atelier-nav-rail"
      className="atelier-nav-rail flex shrink-0 flex-row items-center justify-between gap-2 border-b px-3 py-2 lg:sticky lg:top-0 lg:h-screen lg:w-[96px] lg:flex-col lg:justify-start lg:gap-3 lg:overflow-y-auto lg:border-r lg:border-b-0 lg:px-2 lg:py-3.5"
    >
      {/* Top Press Colophon Brand Block */}
      <div className="flex shrink-0 items-center gap-2 lg:flex-col lg:gap-1.5 lg:text-center">
        <span
          className="colophon-frame atelier-nav-colophon h-8 w-8 lg:h-10 lg:w-10"
          aria-hidden="true"
        >
          <img
            src={atelierColophonImg}
            alt=""
            width={40}
            height={40}
            className="colophon-emblem h-full w-full object-contain"
          />
        </span>
        <h1 className="font-serif text-sm font-semibold leading-tight tracking-tight text-[#faf6ee] lg:text-[13px]">
          <span>Bookbinder</span>{' '}
          <span className="font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] text-[#e2bd6f] lg:mt-0.5 lg:block">
            Studio
          </span>
        </h1>
      </div>

      <div
        className="atelier-nav-divider hidden h-px w-full shrink-0 lg:block"
        role="separator"
        aria-orientation="horizontal"
      />

      {/* Chronological Craft Room Navigation */}
      <nav
        aria-label="Workbench modes"
        className="flex min-w-0 flex-1 items-center justify-end gap-1 overflow-x-auto lg:w-full lg:flex-col lg:items-stretch lg:justify-start lg:gap-2 lg:overflow-visible"
      >
        {ATELIER_NAV_GROUPS.map((group, groupIdx) => (
          <div
            key={group.id}
            className="flex shrink-0 items-center gap-1 lg:flex-col lg:items-stretch lg:gap-1"
          >
            {groupIdx > 0 && (
              <div
                className="atelier-nav-divider mx-1 h-5 w-px shrink-0 lg:mx-2 lg:my-1 lg:h-px lg:w-auto"
                role="separator"
              />
            )}
            <span className="atelier-nav-group-label hidden px-1 text-center lg:block">
              {group.label}
            </span>
            <ul className="flex list-none items-center gap-1 p-0 lg:flex-col lg:items-stretch lg:gap-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                const isPocketsDimmed = item.id === 'pockets' && !usesInnerPockets;
                const showPocketsBadge =
                  item.id === 'pockets' && !usesInnerPockets && Boolean(pocketsBadgeLabel);

                return (
                  <li key={item.id} className="flex">
                    <button
                      type="button"
                      data-testid={item.testId}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={() => onSelectTab(item.id)}
                      className="atelier-nav-item w-full flex-row px-2.5 py-1.5 text-xs lg:flex-col lg:gap-1 lg:px-1.5 lg:py-2"
                    >
                      <Icon
                        className={`atelier-nav-item-icon h-4 w-4 shrink-0 ${
                          isPocketsDimmed && !isActive ? 'opacity-65' : ''
                        }`}
                        aria-hidden="true"
                      />
                      <span
                        className={`whitespace-nowrap text-[11px] leading-tight lg:whitespace-normal lg:text-center lg:text-[10.5px] ${
                          isPocketsDimmed && !isActive ? 'opacity-75' : ''
                        }`}
                      >
                        {item.label}
                      </span>
                      {showPocketsBadge && (
                        <span
                          data-testid="pockets-builtin-badge"
                          className="rounded border border-[#e2bd6f]/45 bg-[#2a1f17] px-1 py-0.5 font-mono text-[8.5px] leading-none text-[#e2bd6f]"
                        >
                          {pocketsBadgeLabel}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
