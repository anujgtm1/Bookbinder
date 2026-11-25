/**
 * Pure, deterministic 2D rectangle bin packer for inner template PDF pagination.
 *
 * Uses MaxRects free-rectangle splitting (against each placed piece's gap-expanded
 * exclusion box, without wasting trailing gap along sheet margins) combined with
 * exact backtracking search over permutations, orientations, and maximal free-rect
 * placements when `items.length <= 4`, and a deterministic area-descending MaxRects
 * fallback for larger item sets.
 */

export interface PackableRect<TKind extends string = string> {
  readonly kind: TKind;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly allowRotate: boolean;
}

export interface PackedRectPlacement<TKind extends string = string> {
  readonly kind: TKind;
  readonly pageIndex: number;
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly rotated90: boolean;
  readonly clipped: boolean;
}

export interface Pack2DOptions<TKind extends string = string> {
  readonly pageWidthMm: number;
  readonly pageHeightMm: number;
  readonly marginMm: number;
  readonly gapMm: number;
  /** When tied on pageCount and clipped overflow, prefer keeping this kind on Page 0. */
  readonly preferFirstPageKind?: TKind;
}

export interface Pack2DResult<TKind extends string = string> {
  readonly pageCount: number;
  readonly placements: readonly PackedRectPlacement<TKind>[];
}

interface FreeRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface OrientedSize {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly rotated90: boolean;
}

interface LocalPlacement<TKind extends string> {
  readonly kind: TKind;
  readonly pageIndex: number;
  readonly xLocal: number;
  readonly yLocal: number;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly rotated90: boolean;
  readonly clipped: boolean;
  readonly overflowAreaMm2: number;
  readonly maxOverhangMm: number;
}

interface PageState {
  readonly freeRects: readonly FreeRect[];
  readonly maxX: number;
  readonly maxY: number;
}

interface PackingScore {
  readonly pageCount: number;
  readonly clippedCount: number;
  readonly overflowAreaMm2: number;
  readonly maxOverhangMm: number;
  readonly preferFirstPagePenalty: number;
  readonly totalBboxAreaMm2: number;
  readonly lastPageMaxYMm: number;
}

interface CandidateSolution<TKind extends string> {
  readonly pageCount: number;
  readonly score: PackingScore;
  readonly placements: readonly LocalPlacement<TKind>[];
}

const EXACT_SEARCH_MAX_ITEMS = 4;
const FIT_EPS_MM = 1e-6;
const SPLIT_EPS_MM = 1e-9;
const MIN_FREE_RECT_MM = 1e-6;
const CONTAIN_EPS_MM = 1e-7;
const OBJECTIVE_EPS = 1e-4;

function getAllowedOrientations<TKind extends string>(
  item: PackableRect<TKind>,
): readonly OrientedSize[] {
  const unrotated: OrientedSize = {
    widthMm: item.widthMm,
    heightMm: item.heightMm,
    rotated90: false,
  };
  if (!item.allowRotate || Math.abs(item.widthMm - item.heightMm) <= FIT_EPS_MM) {
    return [unrotated];
  }
  return [
    unrotated,
    {
      widthMm: item.heightMm,
      heightMm: item.widthMm,
      rotated90: true,
    },
  ];
}

function fitsInRect(rect: FreeRect, widthMm: number, heightMm: number): boolean {
  return widthMm <= rect.width + FIT_EPS_MM && heightMm <= rect.height + FIT_EPS_MM;
}

function computeClippedOverflow(
  widthMm: number,
  heightMm: number,
  usableW: number,
  usableH: number,
): { readonly overflowAreaMm2: number; readonly maxOverhangMm: number } {
  const clampedW = Math.max(0, Math.min(widthMm, usableW));
  const clampedH = Math.max(0, Math.min(heightMm, usableH));
  const overflowAreaMm2 = Math.max(0, widthMm * heightMm - clampedW * clampedH);
  const maxOverhangMm = Math.max(0, widthMm - usableW, heightMm - usableH);
  return { overflowAreaMm2, maxOverhangMm };
}

function selectBestClippedOrientation<TKind extends string>(
  item: PackableRect<TKind>,
  usableW: number,
  usableH: number,
): OrientedSize & { readonly overflowAreaMm2: number; readonly maxOverhangMm: number } {
  const orientations = getAllowedOrientations(item);
  let best = {
    ...orientations[0],
    ...computeClippedOverflow(orientations[0].widthMm, orientations[0].heightMm, usableW, usableH),
  };

  for (let i = 1; i < orientations.length; i += 1) {
    const orient = orientations[i];
    const metrics = computeClippedOverflow(orient.widthMm, orient.heightMm, usableW, usableH);
    const areaDiff = metrics.overflowAreaMm2 - best.overflowAreaMm2;
    if (
      areaDiff < -OBJECTIVE_EPS ||
      (Math.abs(areaDiff) <= OBJECTIVE_EPS && metrics.maxOverhangMm < best.maxOverhangMm - OBJECTIVE_EPS)
    ) {
      best = { ...orient, ...metrics };
    }
  }

  return best;
}

function isRectContainedIn(inner: FreeRect, outer: FreeRect): boolean {
  return (
    inner.x >= outer.x - CONTAIN_EPS_MM &&
    inner.y >= outer.y - CONTAIN_EPS_MM &&
    inner.x + inner.width <= outer.x + outer.width + CONTAIN_EPS_MM &&
    inner.y + inner.height <= outer.y + outer.height + CONTAIN_EPS_MM
  );
}

function pruneContainedFreeRects(rects: readonly FreeRect[]): FreeRect[] {
  const kept: FreeRect[] = [];
  for (let i = 0; i < rects.length; i += 1) {
    const candidate = rects[i];
    let dominated = false;
    for (let j = 0; j < rects.length; j += 1) {
      if (i === j) continue;
      const other = rects[j];
      if (isRectContainedIn(candidate, other)) {
        if (!isRectContainedIn(other, candidate) || j < i) {
          dominated = true;
          break;
        }
      }
    }
    if (!dominated) {
      kept.push(candidate);
    }
  }
  return kept;
}

/**
 * Subtracts the gap-expanded exclusion box `[px - gap, px + pw + gap] × [py - gap, py + ph + gap]`
 * from every intersecting maximal free rectangle and prunes non-maximal sub-rectangles.
 */
function splitFreeRectsForExclusion(
  freeRects: readonly FreeRect[],
  px: number,
  py: number,
  pw: number,
  ph: number,
  gapMm: number,
): FreeRect[] {
  const ex1 = px - gapMm;
  const ey1 = py - gapMm;
  const ex2 = px + pw + gapMm;
  const ey2 = py + ph + gapMm;

  const nextRects: FreeRect[] = [];

  for (const r of freeRects) {
    const rx1 = r.x;
    const ry1 = r.y;
    const rx2 = r.x + r.width;
    const ry2 = r.y + r.height;

    const overlaps =
      rx1 < ex2 - SPLIT_EPS_MM &&
      rx2 > ex1 + SPLIT_EPS_MM &&
      ry1 < ey2 - SPLIT_EPS_MM &&
      ry2 > ey1 + SPLIT_EPS_MM;

    if (!overlaps) {
      nextRects.push(r);
      continue;
    }

    if (ex1 > rx1 + MIN_FREE_RECT_MM) {
      nextRects.push({ x: rx1, y: ry1, width: ex1 - rx1, height: r.height });
    }
    if (ex2 < rx2 - MIN_FREE_RECT_MM) {
      nextRects.push({ x: ex2, y: ry1, width: rx2 - ex2, height: r.height });
    }
    if (ey1 > ry1 + MIN_FREE_RECT_MM) {
      nextRects.push({ x: rx1, y: ry1, width: r.width, height: ey1 - ry1 });
    }
    if (ey2 < ry2 - MIN_FREE_RECT_MM) {
      nextRects.push({ x: rx1, y: ey2, width: r.width, height: ry2 - ey2 });
    }
  }

  return pruneContainedFreeRects(nextRects);
}

function createEmptyPage(usableW: number, usableH: number): PageState {
  const initialFreeRects: FreeRect[] =
    usableW > MIN_FREE_RECT_MM && usableH > MIN_FREE_RECT_MM
      ? [{ x: 0, y: 0, width: usableW, height: usableH }]
      : [];
  return {
    freeRects: initialFreeRects,
    maxX: 0,
    maxY: 0,
  };
}

function placeOnPage(
  page: PageState,
  xLocal: number,
  yLocal: number,
  widthMm: number,
  heightMm: number,
  gapMm: number,
): PageState {
  return {
    freeRects: splitFreeRectsForExclusion(page.freeRects, xLocal, yLocal, widthMm, heightMm, gapMm),
    maxX: Math.max(page.maxX, xLocal + widthMm),
    maxY: Math.max(page.maxY, yLocal + heightMm),
  };
}

function evaluatePackingScore<TKind extends string>(
  pages: readonly PageState[],
  placements: readonly LocalPlacement<TKind>[],
  preferFirstPageKind?: TKind,
): PackingScore {
  const pageCount = pages.length;
  let clippedCount = 0;
  let overflowAreaMm2 = 0;
  let maxOverhangMm = 0;
  let preferFirstPagePenalty = 0;

  for (const p of placements) {
    if (p.clipped) {
      clippedCount += 1;
      overflowAreaMm2 += p.overflowAreaMm2;
      if (p.maxOverhangMm > maxOverhangMm) {
        maxOverhangMm = p.maxOverhangMm;
      }
    }
    if (preferFirstPageKind !== undefined && p.kind === preferFirstPageKind && p.pageIndex !== 0) {
      preferFirstPagePenalty = 1;
    }
  }

  let totalBboxAreaMm2 = 0;
  for (const page of pages) {
    totalBboxAreaMm2 += page.maxX * page.maxY;
  }

  const lastPageMaxYMm = pageCount > 0 ? pages[pageCount - 1].maxY : 0;

  return {
    pageCount,
    clippedCount,
    overflowAreaMm2,
    maxOverhangMm,
    preferFirstPagePenalty,
    totalBboxAreaMm2,
    lastPageMaxYMm,
  };
}

function isScoreBetter(candidate: PackingScore, incumbent: PackingScore): boolean {
  if (candidate.pageCount !== incumbent.pageCount) {
    return candidate.pageCount < incumbent.pageCount;
  }
  if (candidate.clippedCount !== incumbent.clippedCount) {
    return candidate.clippedCount < incumbent.clippedCount;
  }
  if (Math.abs(candidate.overflowAreaMm2 - incumbent.overflowAreaMm2) > OBJECTIVE_EPS) {
    return candidate.overflowAreaMm2 < incumbent.overflowAreaMm2;
  }
  if (Math.abs(candidate.maxOverhangMm - incumbent.maxOverhangMm) > OBJECTIVE_EPS) {
    return candidate.maxOverhangMm < incumbent.maxOverhangMm;
  }
  if (candidate.preferFirstPagePenalty !== incumbent.preferFirstPagePenalty) {
    return candidate.preferFirstPagePenalty < incumbent.preferFirstPagePenalty;
  }
  if (Math.abs(candidate.totalBboxAreaMm2 - incumbent.totalBboxAreaMm2) > OBJECTIVE_EPS) {
    return candidate.totalBboxAreaMm2 < incumbent.totalBboxAreaMm2;
  }
  if (Math.abs(candidate.lastPageMaxYMm - incumbent.lastPageMaxYMm) > OBJECTIVE_EPS) {
    return candidate.lastPageMaxYMm < incumbent.lastPageMaxYMm;
  }
  return false;
}

function collectUniqueFittingCorners(
  freeRects: readonly FreeRect[],
  widthMm: number,
  heightMm: number,
): { readonly x: number; readonly y: number }[] {
  const corners: { readonly x: number; readonly y: number }[] = [];
  for (const rect of freeRects) {
    if (!fitsInRect(rect, widthMm, heightMm)) continue;
    let duplicate = false;
    for (const existing of corners) {
      if (
        Math.abs(existing.x - rect.x) <= CONTAIN_EPS_MM &&
        Math.abs(existing.y - rect.y) <= CONTAIN_EPS_MM
      ) {
        duplicate = true;
        break;
      }
    }
    if (!duplicate) {
      corners.push({ x: rect.x, y: rect.y });
    }
  }
  corners.sort((a, b) => (Math.abs(a.y - b.y) > CONTAIN_EPS_MM ? a.y - b.y : a.x - b.x));
  return corners;
}

interface GreedyChoice {
  readonly pageIndex: number;
  readonly xLocal: number;
  readonly yLocal: number;
  readonly orient: OrientedSize;
  readonly shortSideFit: number;
  readonly longSideFit: number;
}

function findBestGreedyChoice(
  pages: readonly PageState[],
  orientations: readonly OrientedSize[],
): GreedyChoice | null {
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const page = pages[pageIndex];
    let bestForPage: GreedyChoice | null = null;

    for (const orient of orientations) {
      for (const rect of page.freeRects) {
        if (!fitsInRect(rect, orient.widthMm, orient.heightMm)) continue;
        const leftoverW = rect.width - orient.widthMm;
        const leftoverH = rect.height - orient.heightMm;
        const shortSideFit = Math.min(leftoverW, leftoverH);
        const longSideFit = Math.max(leftoverW, leftoverH);

        const better =
          bestForPage === null ||
          shortSideFit < bestForPage.shortSideFit - OBJECTIVE_EPS ||
          (Math.abs(shortSideFit - bestForPage.shortSideFit) <= OBJECTIVE_EPS &&
            (longSideFit < bestForPage.longSideFit - OBJECTIVE_EPS ||
              (Math.abs(longSideFit - bestForPage.longSideFit) <= OBJECTIVE_EPS &&
                (rect.y < bestForPage.yLocal - CONTAIN_EPS_MM ||
                  (Math.abs(rect.y - bestForPage.yLocal) <= CONTAIN_EPS_MM &&
                    rect.x < bestForPage.xLocal - CONTAIN_EPS_MM)))));

        if (better) {
          bestForPage = {
            pageIndex,
            xLocal: rect.x,
            yLocal: rect.y,
            orient,
            shortSideFit,
            longSideFit,
          };
        }
      }
    }

    if (bestForPage !== null) {
      return bestForPage;
    }
  }

  return null;
}

/**
 * Greedy MaxRects Best-Short-Side-Fit packer over a fixed item sequence.
 * Used both to seed a tight branch-and-bound incumbent for exact search and as
 * the deterministic fallback when `items.length > 4`.
 */
function packGreedyMaxRects<TKind extends string>(
  orderedItems: readonly PackableRect<TKind>[],
  usableW: number,
  usableH: number,
  gapMm: number,
  preferFirstPageKind?: TKind,
): CandidateSolution<TKind> {
  const pages: PageState[] = [];
  const placements: LocalPlacement<TKind>[] = [];

  for (const item of orderedItems) {
    const orientations = getAllowedOrientations(item);
    const bestChoice = findBestGreedyChoice(pages, orientations);

    if (bestChoice !== null) {
      const { pageIndex, xLocal, yLocal, orient } = bestChoice;
      pages[pageIndex] = placeOnPage(
        pages[pageIndex],
        xLocal,
        yLocal,
        orient.widthMm,
        orient.heightMm,
        gapMm,
      );
      placements.push({
        kind: item.kind,
        pageIndex,
        xLocal,
        yLocal,
        widthMm: orient.widthMm,
        heightMm: orient.heightMm,
        rotated90: orient.rotated90,
        clipped: false,
        overflowAreaMm2: 0,
        maxOverhangMm: 0,
      });
      continue;
    }

    const newPageIndex = pages.length;
    const emptyPage = createEmptyPage(usableW, usableH);
    const fittingOrient = orientations.find(
      (orient) => orient.widthMm <= usableW + FIT_EPS_MM && orient.heightMm <= usableH + FIT_EPS_MM,
    );

    if (fittingOrient) {
      pages.push(
        placeOnPage(emptyPage, 0, 0, fittingOrient.widthMm, fittingOrient.heightMm, gapMm),
      );
      placements.push({
        kind: item.kind,
        pageIndex: newPageIndex,
        xLocal: 0,
        yLocal: 0,
        widthMm: fittingOrient.widthMm,
        heightMm: fittingOrient.heightMm,
        rotated90: fittingOrient.rotated90,
        clipped: false,
        overflowAreaMm2: 0,
        maxOverhangMm: 0,
      });
    } else {
      const clippedOrient = selectBestClippedOrientation(item, usableW, usableH);
      pages.push(
        placeOnPage(emptyPage, 0, 0, clippedOrient.widthMm, clippedOrient.heightMm, gapMm),
      );
      placements.push({
        kind: item.kind,
        pageIndex: newPageIndex,
        xLocal: 0,
        yLocal: 0,
        widthMm: clippedOrient.widthMm,
        heightMm: clippedOrient.heightMm,
        rotated90: clippedOrient.rotated90,
        clipped: true,
        overflowAreaMm2: clippedOrient.overflowAreaMm2,
        maxOverhangMm: clippedOrient.maxOverhangMm,
      });
    }
  }

  return {
    pageCount: pages.length,
    score: evaluatePackingScore(pages, placements, preferFirstPageKind),
    placements,
  };
}

function sortByAreaDescending<TKind extends string>(
  items: readonly PackableRect<TKind>[],
): PackableRect<TKind>[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const areaDiff = b.item.widthMm * b.item.heightMm - a.item.widthMm * a.item.heightMm;
      if (Math.abs(areaDiff) > OBJECTIVE_EPS) return areaDiff;
      const maxDimDiff =
        Math.max(b.item.widthMm, b.item.heightMm) - Math.max(a.item.widthMm, a.item.heightMm);
      if (Math.abs(maxDimDiff) > OBJECTIVE_EPS) return maxDimDiff;
      return a.index - b.index;
    })
    .map((entry) => entry.item);
}

/**
 * Exact MaxRects backtracking search for `items.length <= 4`.
 * Explores all permutations, allowed orientations, and unique top-left free-rect
 * placements with branch-and-bound pruning on `pageCount`.
 */
function packExactMaxRects<TKind extends string>(
  items: readonly PackableRect<TKind>[],
  usableW: number,
  usableH: number,
  gapMm: number,
  preferFirstPageKind?: TKind,
): CandidateSolution<TKind> {
  const n = items.length;
  const itemOrientations = items.map((item) => getAllowedOrientations(item));
  const emptyPageTemplate = createEmptyPage(usableW, usableH);

  // Seed a tight upper bound with greedy area-descending MaxRects
  const areaOrdered = sortByAreaDescending(items);
  let best = packGreedyMaxRects(areaOrdered, usableW, usableH, gapMm, preferFirstPageKind);

  const fullMask = (1 << n) - 1;
  const currentPlacements: LocalPlacement<TKind>[] = [];

  const canPruneByBbox = (pages: readonly PageState[]): boolean => {
    if (pages.length > best.pageCount) return true;
    if (
      pages.length === best.pageCount &&
      best.score.clippedCount === 0 &&
      best.score.preferFirstPagePenalty === 0
    ) {
      let currentArea = 0;
      for (const page of pages) {
        currentArea += page.maxX * page.maxY;
      }
      if (currentArea > best.score.totalBboxAreaMm2 + OBJECTIVE_EPS) {
        return true;
      }
    }
    return false;
  };

  const evaluateLeaf = (pages: readonly PageState[]): void => {
    const score = evaluatePackingScore(pages, currentPlacements, preferFirstPageKind);
    if (isScoreBetter(score, best.score)) {
      best = {
        pageCount: pages.length,
        score,
        placements: [...currentPlacements],
      };
    }
  };

  const search = (usedMask: number, pages: readonly PageState[]): void => {
    if (canPruneByBbox(pages)) {
      return;
    }

    for (let i = 0; i < n; i += 1) {
      const bit = 1 << i;
      if ((usedMask & bit) !== 0) continue;

      const item = items[i];
      // Symmetry break: if an earlier unused item has identical dimensions & rotation rule
      // (and neither is preferFirstPageKind), placing it first explores the exact same layouts.
      if (item.kind !== preferFirstPageKind) {
        let hasIdenticalEarlierUnused = false;
        for (let j = 0; j < i; j += 1) {
          if ((usedMask & (1 << j)) !== 0) continue;
          const prev = items[j];
          if (
            prev.kind !== preferFirstPageKind &&
            prev.allowRotate === item.allowRotate &&
            Math.abs(prev.widthMm - item.widthMm) <= FIT_EPS_MM &&
            Math.abs(prev.heightMm - item.heightMm) <= FIT_EPS_MM
          ) {
            hasIdenticalEarlierUnused = true;
            break;
          }
        }
        if (hasIdenticalEarlierUnused) continue;
      }

      const orientations = itemOrientations[i];
      const nextMask = usedMask | bit;
      const isLastItem = nextMask === fullMask;

      let fittedAnyOrientationOnExistingPage = false;

      for (const orient of orientations) {
        for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
          const page = pages[pageIndex];
          const corners = collectUniqueFittingCorners(
            page.freeRects,
            orient.widthMm,
            orient.heightMm,
          );
          if (corners.length === 0) continue;
          fittedAnyOrientationOnExistingPage = true;

          for (const corner of corners) {
            const nextPages = pages.slice();
            nextPages[pageIndex] = isLastItem
              ? {
                  freeRects: page.freeRects,
                  maxX: Math.max(page.maxX, corner.x + orient.widthMm),
                  maxY: Math.max(page.maxY, corner.y + orient.heightMm),
                }
              : placeOnPage(page, corner.x, corner.y, orient.widthMm, orient.heightMm, gapMm);
            currentPlacements.push({
              kind: item.kind,
              pageIndex,
              xLocal: corner.x,
              yLocal: corner.y,
              widthMm: orient.widthMm,
              heightMm: orient.heightMm,
              rotated90: orient.rotated90,
              clipped: false,
              overflowAreaMm2: 0,
              maxOverhangMm: 0,
            });
            if (isLastItem) {
              evaluateLeaf(nextPages);
            } else {
              search(nextMask, nextPages);
            }
            currentPlacements.pop();
          }
        }
      }

      // Open a new page only if the item could not fit on any existing page (or when no pages exist yet),
      // and only if opening a new page does not exceed the best page count found so far.
      if (!fittedAnyOrientationOnExistingPage && pages.length + 1 <= best.pageCount) {
        const newPageIndex = pages.length;
        const fittingOrientations = orientations.filter(
          (orient) =>
            orient.widthMm <= usableW + FIT_EPS_MM && orient.heightMm <= usableH + FIT_EPS_MM,
        );

        if (fittingOrientations.length > 0) {
          for (const orient of fittingOrientations) {
            const newPage: PageState = isLastItem
              ? { freeRects: emptyPageTemplate.freeRects, maxX: orient.widthMm, maxY: orient.heightMm }
              : placeOnPage(emptyPageTemplate, 0, 0, orient.widthMm, orient.heightMm, gapMm);
            const nextPages = [...pages, newPage];
            currentPlacements.push({
              kind: item.kind,
              pageIndex: newPageIndex,
              xLocal: 0,
              yLocal: 0,
              widthMm: orient.widthMm,
              heightMm: orient.heightMm,
              rotated90: orient.rotated90,
              clipped: false,
              overflowAreaMm2: 0,
              maxOverhangMm: 0,
            });
            if (isLastItem) {
              evaluateLeaf(nextPages);
            } else {
              search(nextMask, nextPages);
            }
            currentPlacements.pop();
          }
        } else {
          const clippedOrient = selectBestClippedOrientation(item, usableW, usableH);
          const newPage: PageState = isLastItem
            ? {
                freeRects: emptyPageTemplate.freeRects,
                maxX: clippedOrient.widthMm,
                maxY: clippedOrient.heightMm,
              }
            : placeOnPage(
                emptyPageTemplate,
                0,
                0,
                clippedOrient.widthMm,
                clippedOrient.heightMm,
                gapMm,
              );
          const nextPages = [...pages, newPage];
          currentPlacements.push({
            kind: item.kind,
            pageIndex: newPageIndex,
            xLocal: 0,
            yLocal: 0,
            widthMm: clippedOrient.widthMm,
            heightMm: clippedOrient.heightMm,
            rotated90: clippedOrient.rotated90,
            clipped: true,
            overflowAreaMm2: clippedOrient.overflowAreaMm2,
            maxOverhangMm: clippedOrient.maxOverhangMm,
          });
          if (isLastItem) {
            evaluateLeaf(nextPages);
          } else {
            search(nextMask, nextPages);
          }
          currentPlacements.pop();
        }
      }
    }
  };

  search(0, []);
  return best;
}

/**
 * Packs 2D rectangles onto uniform sheets with strict edge margins and inter-piece clearance.
 *
 * Guarantees:
 * - Every non-oversized piece fits strictly within `[marginMm, pageWidthMm - marginMm]`
 *   × `[marginMm, pageHeightMm - marginMm]`.
 * - Every pair of pieces on the same page has at least `gapMm` horizontal or vertical clearance.
 * - Deterministic lexicographic optimization: minimum pageCount, minimum clipped overflow,
 *   optional `preferFirstPageKind` on Page 0, minimum total bounding-box area, minimum last-page Y.
 */
export function packRects2D<TKind extends string>(
  items: readonly PackableRect<TKind>[],
  options: Pack2DOptions<TKind>,
): Pack2DResult<TKind> {
  if (items.length === 0) {
    return { pageCount: 0, placements: [] };
  }

  const usableW = Math.max(0, options.pageWidthMm - options.marginMm * 2);
  const usableH = Math.max(0, options.pageHeightMm - options.marginMm * 2);
  const gapMm = Math.max(0, options.gapMm);

  let chosen: CandidateSolution<TKind>;

  if (items.length <= EXACT_SEARCH_MAX_ITEMS) {
    chosen = packExactMaxRects(items, usableW, usableH, gapMm, options.preferFirstPageKind);
  } else {
    const areaDescending = sortByAreaDescending(items);
    chosen = packGreedyMaxRects(areaDescending, usableW, usableH, gapMm, options.preferFirstPageKind);

    if (options.preferFirstPageKind !== undefined) {
      const preferredFirst = [
        ...areaDescending.filter((item) => item.kind === options.preferFirstPageKind),
        ...areaDescending.filter((item) => item.kind !== options.preferFirstPageKind),
      ];
      const preferredCandidate = packGreedyMaxRects(
        preferredFirst,
        usableW,
        usableH,
        gapMm,
        options.preferFirstPageKind,
      );
      if (isScoreBetter(preferredCandidate.score, chosen.score)) {
        chosen = preferredCandidate;
      }
    }
  }

  const placements: PackedRectPlacement<TKind>[] = chosen.placements
    .map((p) => ({
      kind: p.kind,
      pageIndex: p.pageIndex,
      xMm: options.marginMm + p.xLocal,
      yMm: options.marginMm + p.yLocal,
      widthMm: p.widthMm,
      heightMm: p.heightMm,
      rotated90: p.rotated90,
      clipped: p.clipped,
    }))
    .sort((a, b) => {
      if (a.pageIndex !== b.pageIndex) return a.pageIndex - b.pageIndex;
      if (Math.abs(a.yMm - b.yMm) > CONTAIN_EPS_MM) return a.yMm - b.yMm;
      if (Math.abs(a.xMm - b.xMm) > CONTAIN_EPS_MM) return a.xMm - b.xMm;
      return a.kind.localeCompare(b.kind);
    });

  return {
    pageCount: chosen.pageCount,
    placements,
  };
}
