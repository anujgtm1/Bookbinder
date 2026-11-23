import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import { DEFAULT_BOOK_PARAMETERS } from '@/types/bookParams';
import { CutListCard } from './CutListCard';

describe('CutListCard', () => {
  it('renders exact chipboard dimensions, roll badge, and 9mm hinge spacer diagram in mm', () => {
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    render(<CutListCard geometry={geom} unit="mm" />);

    expect(screen.getByTestId('cut-cover-boards')).toHaveTextContent('143.0 × 223.0 mm');
    expect(screen.getByTestId('cut-spine-strip')).toHaveTextContent('26.0 × 223.0 mm');
    expect(screen.getByTestId('cut-outer-wrap')).toHaveTextContent('366.0 × 259.0 mm');
    expect(screen.getByTestId('roll-recommendation-badge')).toHaveTextContent('13" roll');
    expect(screen.getByRole('img', { name: /9 mm spacer/i })).toBeInTheDocument();
  });

  it('formats dimensions in inches when unit is toggled to in', () => {
    const geom = calculateCaseGeometry(DEFAULT_BOOK_PARAMETERS);
    render(<CutListCard geometry={geom} unit="in" />);

    expect(screen.getByTestId('cut-cover-boards')).toHaveTextContent('5.63 × 8.78 in');
    expect(screen.getByTestId('cut-spine-strip')).toHaveTextContent('1.02 × 8.78 in');
  });

  it('adapts Cut List and assembly diagrams cleanly for Flexible Spine and Softcover Jacket styles', () => {
    const flexGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'flexible-spine',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 5,
    });
    const { rerender } = render(<CutListCard geometry={flexGeom} unit="mm" />);
    expect(screen.getByTestId('cut-spine-strip')).toHaveTextContent('Qty 0');
    expect(screen.getByTestId('cut-spine-strip')).toHaveTextContent('Cloth Gap');

    const softGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'softcover-jacket',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 5,
    });
    rerender(<CutListCard geometry={softGeom} unit="mm" />);
    expect(screen.getByTestId('cut-cover-boards')).toHaveTextContent('0-Board Softcover');
    expect(screen.getByTestId('cut-spine-strip')).toHaveTextContent('Tuck Flaps');
    expect(screen.getByTestId('roll-recommendation-badge')).toHaveTextContent(
      'US Letter / A4 (8.5 × 11")',
    );
    expect(screen.getByTestId('cut-list-card')).toHaveTextContent('Glue blank back of 4 tabs');

    const legalSoftGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'softcover-jacket',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 5,
      jacketFlapWidthMm: 38,
      printMedia: 'legal',
    });
    rerender(<CutListCard geometry={legalSoftGeom} unit="mm" />);
    expect(screen.getByTestId('roll-recommendation-badge')).toHaveTextContent(
      'US Legal (8.5 × 14")',
    );
  });

  it('renders crisp 0-board cards, fold counts, and materialNote for paperback-wrap and dust-jacket', () => {
    const pbGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'paperback-wrap',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 10,
    });
    const { rerender } = render(<CutListCard geometry={pbGeom} unit="mm" />);

    expect(screen.getByTestId('cut-cover-boards')).toHaveTextContent('None');
    expect(screen.getByTestId('cut-cover-boards')).toHaveTextContent('0-Board Paperback');
    expect(screen.getByTestId('cut-spine-strip')).toHaveTextContent('2 Folds');
    expect(screen.getByTestId('cut-spine-strip')).toHaveTextContent('10.0 mm Spine');
    expect(screen.getByTestId('cut-outer-wrap')).toHaveTextContent('220.0 × 148.0 mm');
    expect(screen.getByTestId('cut-list-card')).toHaveTextContent('220–300 gsm cover cardstock');
    expect(screen.getByRole('img', { name: /2 score folds/i })).toBeInTheDocument();

    const djGeom = calculateCaseGeometry({
      ...DEFAULT_BOOK_PARAMETERS,
      bindingStyle: 'dust-jacket',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 10,
      jacketFlapWidthMm: 70,
    });
    rerender(<CutListCard geometry={djGeom} unit="mm" />);

    expect(screen.getByTestId('cut-cover-boards')).toHaveTextContent('None');
    expect(screen.getByTestId('cut-cover-boards')).toHaveTextContent('0-Board Dust Jacket');
    expect(screen.getByTestId('cut-spine-strip')).toHaveTextContent('70.0 mm Flaps');
    expect(screen.getByTestId('cut-spine-strip')).toHaveTextContent('4 vertical fold stops');
    expect(screen.getByTestId('cut-outer-wrap')).toHaveTextContent('363.5 × 148.0 mm');
    expect(screen.getByTestId('cut-list-card')).toHaveTextContent('130–200 gsm coated or matte paper');
    expect(screen.getByRole('img', { name: /4 vertical score folds/i })).toBeInTheDocument();
  });
});
