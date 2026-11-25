import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import { DEFAULT_BOOK_PARAMETERS } from '@/types/bookParams';
import { OuterBlueprintCanvas } from './OuterBlueprintCanvas';

describe('OuterBlueprintCanvas', () => {
  it('renders single-piece hardcover wrap with board guides, bleed rect, and CAD dimensions', () => {
    const geometry = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);

    render(
      <OuterBlueprintCanvas
        geometry={geometry}
        splitMode="single"
        unit="mm"
        zoom={1}
        onAdjustZoom={vi.fn()}
        pan={{ x: 0, y: 0 }}
        onPanChange={vi.fn()}
      />,
    );

    const svg = screen.getByTestId('outer-blueprint-svg');
    expect(svg).toBeInTheDocument();
    expect(screen.getByTestId('blueprint-cut-polygon')).toBeInTheDocument();
    expect(screen.getByTestId('blueprint-bleed-rect')).toBeInTheDocument();
    expect(screen.queryByTestId('blueprint-split-panels')).not.toBeInTheDocument();
    expect(screen.queryByTestId('blueprint-softcover-flaps-and-tabs')).not.toBeInTheDocument();

    expect(svg).toHaveTextContent('BACK BOARD');
    expect(svg).toHaveTextContent('SPINE');
    expect(svg).toHaveTextContent('FRONT BOARD');

    const dims = screen.getByTestId('outer-blueprint-dimensions');
    expect(dims).toHaveTextContent('TOTAL W: 368.0 mm');
    expect(dims).toHaveTextContent('TOTAL H: 259.0 mm');
    expect(screen.getByTestId('blueprint-cumulative-ruler')).toHaveTextContent('RULER (mm)');
    expect(screen.getByTestId('blueprint-miter-callout')).toHaveTextContent('45° MITER LEG');
  });

  it('renders 3-piece split panels when splitMode is three-piece', () => {
    const geometry = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      splitMode: 'three-piece',
    });

    render(
      <OuterBlueprintCanvas
        geometry={geometry}
        splitMode="three-piece"
        unit="mm"
        zoom={1}
        onAdjustZoom={vi.fn()}
        pan={{ x: 0, y: 0 }}
        onPanChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('blueprint-split-panels')).toBeInTheDocument();
    expect(screen.queryByTestId('blueprint-cut-polygon')).not.toBeInTheDocument();
    expect(screen.getByText(/3-PIECE SPLIT/)).toBeInTheDocument();
    expect(screen.getByTestId('split-panel-dims-back')).toBeInTheDocument();
    expect(screen.getByTestId('split-panel-dims-spine')).toBeInTheDocument();
    expect(screen.getByTestId('split-panel-dims-front')).toBeInTheDocument();
  });

  it('renders softcover slip cover with integrated flaps and 4 mitered wrap-over glue tabs', () => {
    const geometry = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'softcover-jacket',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 5,
      jacketFlapWidthMm: 52.5,
    });

    render(
      <OuterBlueprintCanvas
        geometry={geometry}
        splitMode="single"
        unit="mm"
        zoom={1}
        onAdjustZoom={vi.fn()}
        pan={{ x: 0, y: 0 }}
        onPanChange={vi.fn()}
      />,
    );

    const svg = screen.getByTestId('outer-blueprint-svg');
    expect(svg).toHaveTextContent('BACK COVER');
    expect(svg).toHaveTextContent('FRONT COVER');

    const flapsAndTabs = screen.getByTestId('blueprint-softcover-flaps-and-tabs');
    expect(flapsAndTabs).toBeInTheDocument();
    expect(screen.getAllByText('TUCK FLAP (52.5 mm)')).toHaveLength(2);
    expect(screen.getAllByText('GLUE')).toHaveLength(4);
    expect(screen.queryByTestId('blueprint-miter-callout')).not.toBeInTheDocument();

    const dims = screen.getByTestId('outer-blueprint-dimensions');
    expect(dims).toHaveTextContent('TOTAL W: 323.0 mm');
    expect(dims).toHaveTextContent('TOTAL H: 170.0 mm');
  });

  it('renders paperback-wrap with 2 vertical spine fold lines, zero glue tabs, and no miter callout', () => {
    const geometry = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'paperback-wrap',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 10,
    });

    render(
      <OuterBlueprintCanvas
        geometry={geometry}
        splitMode="single"
        unit="mm"
        zoom={1}
        onAdjustZoom={vi.fn()}
        pan={{ x: 0, y: 0 }}
        onPanChange={vi.fn()}
      />,
    );

    const svg = screen.getByTestId('outer-blueprint-svg');
    expect(svg).toHaveTextContent('BACK COVER');
    expect(svg).toHaveTextContent('SPINE');
    expect(svg).toHaveTextContent('FRONT COVER');
    expect(screen.getAllByTestId('blueprint-fold-line')).toHaveLength(2);
    expect(screen.queryByTestId('blueprint-softcover-flaps-and-tabs')).not.toBeInTheDocument();
    expect(screen.queryByText('GLUE')).not.toBeInTheDocument();
    expect(screen.queryByTestId('blueprint-miter-callout')).not.toBeInTheDocument();

    const dims = screen.getByTestId('outer-blueprint-dimensions');
    expect(dims).toHaveTextContent('TOTAL W: 220.0 mm');
    expect(dims).toHaveTextContent('TOTAL H: 148.0 mm');
  });

  it('renders dust-jacket with BACK FLAP / FRONT FLAP, 4 vertical fold lines, zero glue tabs, and no miter callout', () => {
    const geometry = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'dust-jacket',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 10,
      jacketFlapWidthMm: 70,
    });

    render(
      <OuterBlueprintCanvas
        geometry={geometry}
        splitMode="single"
        unit="mm"
        zoom={1}
        onAdjustZoom={vi.fn()}
        pan={{ x: 0, y: 0 }}
        onPanChange={vi.fn()}
      />,
    );

    const svg = screen.getByTestId('outer-blueprint-svg');
    expect(svg).toHaveTextContent('BACK COVER');
    expect(svg).toHaveTextContent('FRONT COVER');
    expect(screen.getAllByTestId('blueprint-fold-line')).toHaveLength(4);

    const flaps = screen.getByTestId('blueprint-softcover-flaps-and-tabs');
    expect(flaps).toHaveTextContent('BACK FLAP (70 mm)');
    expect(flaps).toHaveTextContent('FRONT FLAP (70 mm)');
    expect(screen.queryByText('GLUE')).not.toBeInTheDocument();
    expect(screen.queryByTestId('blueprint-miter-callout')).not.toBeInTheDocument();

    const dims = screen.getByTestId('outer-blueprint-dimensions');
    expect(dims).toHaveTextContent('TOTAL W: 363.5 mm');
    expect(dims).toHaveTextContent('TOTAL H: 148.0 mm');
  });

  it('toggles CAD dimensions visibility via showDimensions in single and 3-piece modes and handles wheel zoom', () => {
    const geometry = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    const onAdjustZoom = vi.fn();

    const { rerender, container } = render(
      <OuterBlueprintCanvas
        geometry={geometry}
        splitMode="single"
        unit="mm"
        zoom={1}
        onAdjustZoom={onAdjustZoom}
        pan={{ x: 0, y: 0 }}
        onPanChange={vi.fn()}
        showDimensions={true}
      />,
    );

    expect(screen.getByTestId('outer-blueprint-dimensions')).toBeInTheDocument();

    rerender(
      <OuterBlueprintCanvas
        geometry={geometry}
        splitMode="single"
        unit="mm"
        zoom={1}
        onAdjustZoom={onAdjustZoom}
        pan={{ x: 0, y: 0 }}
        onPanChange={vi.fn()}
        showDimensions={false}
      />,
    );
    expect(screen.queryByTestId('outer-blueprint-dimensions')).not.toBeInTheDocument();

    rerender(
      <OuterBlueprintCanvas
        geometry={geometry}
        splitMode="three-piece"
        unit="in"
        zoom={1}
        onAdjustZoom={onAdjustZoom}
        pan={{ x: 0, y: 0 }}
        onPanChange={vi.fn()}
        showDimensions={false}
      />,
    );
    expect(screen.queryByTestId('split-panel-dims-back')).not.toBeInTheDocument();
    expect(screen.queryByTestId('split-panel-dims-spine')).not.toBeInTheDocument();
    expect(screen.queryByTestId('split-panel-dims-front')).not.toBeInTheDocument();

    fireEvent.wheel(container.firstElementChild!, { deltaY: -100 });
    expect(onAdjustZoom).toHaveBeenCalledWith(0.15);
  });
});
