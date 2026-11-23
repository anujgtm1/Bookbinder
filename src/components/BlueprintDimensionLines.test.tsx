import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  CornerMiterCallout,
  CumulativeRulerStrip,
  GrainDirectionArrow,
  HorizontalDimLine,
  VerticalDimLine,
} from './BlueprintDimensionLines';

describe('BlueprintDimensionLines', () => {
  it('renders horizontal/vertical dimension lines, cumulative ruler stops, corner miter callout, and grain arrow in mm and in', () => {
    const { rerender } = render(
      <svg viewBox="-40 -40 460 340">
        <HorizontalDimLine x1={0} x2={366} y={-18} anchorY={0} label="366.0 mm" emphasized />
        <VerticalDimLine y1={0} y2={259} x={-18} anchorX={0} label="259.0 mm" emphasized />
        <CumulativeRulerStrip
          stops={[{ xMm: 0 }, { xMm: 18 }, { xMm: 161 }, { xMm: 366 }]}
          y={275}
          anchorY={259}
          unit="mm"
        />
        <CornerMiterCallout miterCutLegMm={31.76} miterGapMm={3.0} unit="mm" />
        <GrainDirectionArrow x={80} centerY={120} />
      </svg>,
    );

    expect(screen.getByText('366.0 mm')).toBeInTheDocument();
    expect(screen.getByText('259.0 mm')).toBeInTheDocument();
    expect(screen.getByTestId('blueprint-cumulative-ruler')).toHaveTextContent('RULER (mm)');
    expect(screen.getByTestId('blueprint-cumulative-ruler')).toHaveTextContent('161.0');
    expect(screen.getByTestId('blueprint-miter-callout')).toHaveTextContent('45° MITER LEG: 31.8 mm');
    expect(screen.getByTestId('blueprint-miter-callout')).toHaveTextContent('Board Corner Gap: 3.0 mm');
    expect(screen.getByTestId('blueprint-grain-arrow')).toHaveTextContent('GRAIN');

    rerender(
      <svg viewBox="-40 -40 460 340">
        <CumulativeRulerStrip
          stops={[{ xMm: 0 }, { xMm: 25.4 }]}
          y={275}
          anchorY={259}
          unit="in"
        />
        <CornerMiterCallout miterCutLegMm={0} miterGapMm={0} unit="in" />
      </svg>,
    );
    expect(screen.getByTestId('blueprint-cumulative-ruler')).toHaveTextContent('RULER (in)');
    expect(screen.getByTestId('blueprint-cumulative-ruler')).toHaveTextContent('1.00');
    expect(screen.queryByTestId('blueprint-miter-callout')).not.toBeInTheDocument();
  });
});
