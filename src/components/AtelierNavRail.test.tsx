import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AtelierNavRail } from './AtelierNavRail';

describe('AtelierNavRail', () => {
  it('renders the Bookbinder Studio H1 heading and chronological craft groups', () => {
    render(<AtelierNavRail activeTab="outer" onSelectTab={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Bookbinder Studio');
    expect(screen.getByRole('navigation', { name: 'Workbench modes' })).toBeInTheDocument();

    expect(screen.getByTestId('nav-measure')).toHaveTextContent('Measure');
    expect(screen.getByTestId('nav-outer')).toHaveTextContent('Cover');
    expect(screen.getByTestId('nav-pockets')).toHaveTextContent('Endpapers');
    expect(screen.getByTestId('nav-make')).toHaveTextContent('Make & Print');
  });

  it('marks only the active room with aria-current="page" and notifies on click', async () => {
    const user = userEvent.setup();
    const onSelectTab = vi.fn();

    render(<AtelierNavRail activeTab="outer" onSelectTab={onSelectTab} />);

    expect(screen.getByTestId('nav-outer')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('nav-measure')).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('nav-pockets')).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('nav-make')).not.toHaveAttribute('aria-current');

    await user.click(screen.getByTestId('nav-measure'));
    expect(onSelectTab).toHaveBeenCalledWith('measure');

    await user.click(screen.getByTestId('nav-make'));
    expect(onSelectTab).toHaveBeenCalledWith('make');
  });

  it('shows the pockets badge only when inner pockets are not used', () => {
    const { rerender } = render(
      <AtelierNavRail
        activeTab="outer"
        onSelectTab={vi.fn()}
        usesInnerPockets={true}
        pocketsBadgeLabel="Built-In"
      />,
    );

    expect(screen.queryByTestId('pockets-builtin-badge')).not.toBeInTheDocument();

    rerender(
      <AtelierNavRail
        activeTab="outer"
        onSelectTab={vi.fn()}
        usesInnerPockets={false}
        pocketsBadgeLabel="Built-In"
      />,
    );

    expect(screen.getByTestId('pockets-builtin-badge')).toHaveTextContent('Built-In');
  });
});
