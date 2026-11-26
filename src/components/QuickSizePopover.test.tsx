import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BookParametersModel, type BookParameters } from '@/types/bookParams';
import { QuickSizePopover } from './QuickSizePopover';

describe('QuickSizePopover', () => {
  it('displays active binding style and dimensions, and exposes no ARIA menu/haspopup roles', () => {
    const params = BookParametersModel.createDefault();
    render(
      <QuickSizePopover
        params={params}
        onChange={vi.fn()}
        onOpenMeasureBench={vi.fn()}
      />,
    );

    const trigger = screen.getByTestId('quick-size-trigger');
    expect(trigger).toHaveTextContent('Rigid Case');
    expect(trigger).toHaveTextContent('140.0 × 216.0 × 24.0 mm');
    expect(trigger).not.toHaveAttribute('aria-haspopup');
    expect(screen.getByTestId('quick-size-popover')).not.toHaveAttribute('role', 'menu');
  });

  it('opens popover, updates dimensions, binding style, flap controls, and jumps to Measure Bench', async () => {
    const user = userEvent.setup();
    const onOpenMeasureBench = vi.fn();
    let latestParams: BookParameters = BookParametersModel.createDefault();

    function Harness() {
      const [params, setParams] = useState<BookParameters>(latestParams);
      return (
        <QuickSizePopover
          params={params}
          onChange={(next) => {
            latestParams = next;
            setParams(next);
          }}
          onOpenMeasureBench={onOpenMeasureBench}
        />
      );
    }

    render(<Harness />);

    await user.click(screen.getByTestId('quick-size-trigger'));
    expect(screen.getByTestId('quick-size-popover')).toBeVisible();

    // Update width
    const widthInput = screen.getByTestId('quick-size-pb-width');
    await user.clear(widthInput);
    await user.type(widthInput, '145');
    expect(latestParams.pbWidthMm).toBe(145);

    // Switch binding style to Fold-and-Glue Slip Cover -> reveals pocket mode & flap slider
    await user.click(screen.getByTestId('quick-size-binding-softcover-jacket'));
    expect(latestParams.bindingStyle).toBe('softcover-jacket');
    expect(screen.getByTestId('quick-size-pocket-mode')).toBeInTheDocument();
    expect(screen.getByTestId('quick-size-flap-controls')).toBeInTheDocument();

    // Toggle unit to inches
    await user.click(screen.getByTestId('quick-size-unit-in'));
    expect(latestParams.unit).toBe('in');

    // Click Open Measure Bench -> invokes callback
    await user.click(screen.getByTestId('quick-size-open-measure-btn'));
    expect(onOpenMeasureBench).toHaveBeenCalledTimes(1);
  });
});
