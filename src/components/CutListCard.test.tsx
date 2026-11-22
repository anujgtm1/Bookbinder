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
});
