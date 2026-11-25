import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDefaultProjectRepository } from '@/core/projectLibrary';
import { App } from './App';

describe('App', () => {
  beforeAll(() => {
    if (typeof HTMLElement !== 'undefined') {
      if (!HTMLElement.prototype.hasPointerCapture) {
        HTMLElement.prototype.hasPointerCapture = () => false;
      }
      if (!HTMLElement.prototype.setPointerCapture) {
        HTMLElement.prototype.setPointerCapture = () => {};
      }
      if (!HTMLElement.prototype.releasePointerCapture) {
        HTMLElement.prototype.releasePointerCapture = () => {};
      }
      if (!HTMLElement.prototype.scrollIntoView) {
        HTMLElement.prototype.scrollIntoView = () => {};
      }
    }
  });

  beforeEach(() => {
    window.localStorage.clear();
    resetDefaultProjectRepository();
  });

  it('renders the main Bookbinder Studio shell and toggles the Book Specifications sidebar', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Bookbinder Studio');
    expect(screen.getByTestId('cover-styler')).toBeInTheDocument();
    expect(screen.getByTestId('input-pb-width')).toBeInTheDocument();

    await user.click(screen.getByTestId('toggle-sidebar-btn'));
    expect(screen.queryByTestId('input-pb-width')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('toggle-sidebar-btn'));
    expect(screen.getByTestId('input-pb-width')).toBeInTheDocument();
  });

  it('switches cleanly between Cover Studio, Measure & Cut, and Inner Pockets tabs', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Default active tab is Cover Studio
    expect(screen.getByTestId('cover-styler')).toBeInTheDocument();
    expect(screen.queryByTestId('measure-and-cut-panel')).not.toBeInTheDocument();

    // Switch to Measure & Cut
    await user.click(screen.getByTestId('nav-measure'));
    expect(screen.getByTestId('measure-and-cut-panel')).toBeInTheDocument();
    expect(screen.getByTestId('cut-list-card')).toBeInTheDocument();
    expect(screen.getByTestId('outer-blueprint-svg')).toBeInTheDocument();

    // Switch to Inner Pockets
    await user.click(screen.getByTestId('nav-pockets'));
    expect(screen.getByTestId('inner-pockets-studio')).toBeInTheDocument();
    expect(screen.getByTestId('inner-blueprint-svg')).toBeInTheDocument();

    // Switch back to Cover Studio
    await user.click(screen.getByTestId('nav-outer'));
    expect(screen.getByTestId('cover-styler')).toBeInTheDocument();
  });

  it('shows the Built-In badge and notice on Inner Pockets when switching to Softcover Slip Cover', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.queryByTestId('pockets-builtin-badge')).not.toBeInTheDocument();

    // Switch binding style to Fold-and-Glue Slip Cover (0-Board Softcover)
    await user.click(screen.getByTestId('binding-style-select'));
    await user.click(screen.getByRole('option', { name: /Fold-and-Glue Slip Cover/i }));

    expect(screen.getByTestId('pockets-builtin-badge')).toHaveTextContent('Built-In');
    expect(screen.getByTestId('softcover-flap-controls')).toBeInTheDocument();

    // Opening Inner Pockets renders the Built-In notice instead of separate pockets studio
    await user.click(screen.getByTestId('nav-pockets'));
    expect(screen.getByTestId('pockets-not-needed-notice')).toBeInTheDocument();
    expect(screen.getByText('Inner Pockets Are Already Included')).toBeInTheDocument();
    expect(screen.queryByTestId('inner-pockets-studio')).not.toBeInTheDocument();

    // Returning to Cover Studio works via the notice CTA
    await user.click(screen.getByTestId('pockets-return-studio-btn'));
    expect(screen.getByTestId('cover-styler')).toBeInTheDocument();

    // Re-open Inner Pockets and switch to Flexible Spine via the secondary CTA -> reveals Inner Pockets Studio
    await user.click(screen.getByTestId('nav-pockets'));
    await user.click(screen.getByTestId('pockets-switch-flexible-btn'));
    expect(screen.getByTestId('inner-pockets-studio')).toBeInTheDocument();
    expect(screen.queryByTestId('pockets-builtin-badge')).not.toBeInTheDocument();
  });

  it('shows Not Needed badge & dynamic notice on Inner Pockets for Replacement Paperback Cover and Classic Dust Jacket, auto-switching away when entered from Inner Pockets', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Open Inner Pockets first
    await user.click(screen.getByTestId('nav-pockets'));
    expect(screen.getByTestId('inner-pockets-studio')).toBeInTheDocument();

    // Switch to Replacement Paperback Cover -> auto-switches to Cover Studio and shows Not Needed badge
    await user.click(screen.getByTestId('binding-style-select'));
    await user.click(screen.getByRole('option', { name: /Replacement Paperback Cover/i }));
    expect(screen.getByTestId('cover-styler')).toBeInTheDocument();
    expect(screen.getByTestId('pockets-builtin-badge')).toHaveTextContent('Not Needed');

    // Clicking Inner Pockets renders paperback-wrap dynamic notice
    await user.click(screen.getByTestId('nav-pockets'));
    expect(screen.getByTestId('pockets-not-needed-notice')).toBeInTheDocument();
    expect(
      screen.getByText('Replacement Paperback Cover — No Inner Pockets or Chipboard'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('inner-pockets-studio')).not.toBeInTheDocument();

    // Switch to Classic Dust Jacket -> Not Needed badge + dust jacket heading
    await user.click(screen.getByTestId('binding-style-select'));
    await user.click(screen.getByRole('option', { name: /Classic Dust Jacket/i }));
    expect(screen.getByTestId('pockets-builtin-badge')).toHaveTextContent('Not Needed');
    expect(
      screen.getByText('Classic Dust Jacket — No Separate Inner Pockets'),
    ).toBeInTheDocument();
  });

  it('unlocks Inner Pockets tab cleanly when switching Fold-and-Glue Slip Cover to Separate Pockets (2-Sheet)', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Select Fold-and-Glue Slip Cover (1-Piece default -> Built-In badge on Inner Pockets tab)
    await user.click(screen.getByTestId('binding-style-select'));
    await user.click(screen.getByRole('option', { name: /Fold-and-Glue Slip Cover/i }));
    expect(screen.getByTestId('pockets-builtin-badge')).toHaveTextContent('Built-In');

    // Switch to Separate Pockets (2-Sheet) -> Built-In badge disappears and Inner Pockets studio renders
    await user.click(screen.getByTestId('softcover-pocket-mode-separate'));
    expect(screen.queryByTestId('pockets-builtin-badge')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('nav-pockets'));
    expect(screen.getByTestId('inner-pockets-studio')).toBeInTheDocument();
    expect(screen.queryByTestId('pockets-not-needed-notice')).not.toBeInTheDocument();
  });
});
