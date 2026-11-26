import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  getDefaultProjectRepository,
  resetDefaultProjectRepository,
} from '@/core/projectLibrary';
import { saveProjectToStorage } from '@/core/storage';
import { BookParametersModel } from '@/types/bookParams';
import { BookbinderProjectModel } from '@/types/project';
import { asProjectId } from '@/types/projectLibrary';
import { CoverStudioModel } from '@/types/studio';
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

  it('renders the main Bookbinder Studio shell in Clean Mode by default and toggles the Book Specifications sidebar and All Controls density', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Bookbinder Studio');
    expect(screen.getByTestId('cover-styler')).toBeInTheDocument();
    // Clean Mode starts with the sidebar collapsed for a spacious Cover Studio hero
    expect(screen.queryByTestId('input-pb-width')).not.toBeInTheDocument();

    // Expanding the sidebar on demand reveals Book Specifications
    await user.click(screen.getByTestId('toggle-sidebar-btn'));
    expect(screen.getByTestId('input-pb-width')).toBeInTheDocument();

    await user.click(screen.getByTestId('toggle-sidebar-btn'));
    expect(screen.queryByTestId('input-pb-width')).not.toBeInTheDocument();

    // Toggling UI density to All Controls expands the sidebar and persists the preference
    await user.click(screen.getByTestId('ui-density-toggle-btn'));
    expect(screen.getByTestId('ui-density-toggle-btn')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('input-pb-width')).toBeInTheDocument();
  });

  it('switches cleanly between Cover, Measure, Endpapers, and Make & Print rooms', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Default active room is Cover Studio
    expect(screen.getByTestId('cover-styler')).toBeInTheDocument();
    expect(screen.getByTestId('nav-outer')).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByTestId('measure-and-cut-panel')).not.toBeInTheDocument();

    // Switch to Measure -> sidebar is always visible on the Measure bench
    await user.click(screen.getByTestId('nav-measure'));
    expect(screen.getByTestId('nav-measure')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('measure-and-cut-panel')).toBeInTheDocument();
    expect(screen.getByTestId('input-pb-width')).toBeInTheDocument();
    expect(screen.getByTestId('cut-list-card')).toBeInTheDocument();
    expect(screen.getByTestId('outer-blueprint-svg')).toBeInTheDocument();

    // Switch to Endpapers
    await user.click(screen.getByTestId('nav-pockets'));
    expect(screen.getByTestId('nav-pockets')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('inner-pockets-studio')).toBeInTheDocument();
    expect(screen.getByTestId('inner-blueprint-svg')).toBeInTheDocument();

    // Switch to Make & Print -> full-width production hub (no sidebar)
    await user.click(screen.getByTestId('nav-make'));
    expect(screen.getByTestId('nav-make')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('make-print-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('input-pb-width')).not.toBeInTheDocument();

    // Switch back to Cover Studio
    await user.click(screen.getByTestId('nav-outer'));
    expect(screen.getByTestId('cover-styler')).toBeInTheDocument();
  });

  it('shows the Built-In badge and notice on Inner Pockets when switching to Softcover Slip Cover', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.queryByTestId('pockets-builtin-badge')).not.toBeInTheDocument();

    // Expand Book Specifications sidebar and switch binding style to Fold-and-Glue Slip Cover
    await user.click(screen.getByTestId('toggle-sidebar-btn'));
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

    // Open Inner Pockets and expand sidebar
    await user.click(screen.getByTestId('nav-pockets'));
    await user.click(screen.getByTestId('toggle-sidebar-btn'));
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

    // Expand sidebar & select Fold-and-Glue Slip Cover (1-Piece default -> Built-In badge on Inner Pockets tab)
    await user.click(screen.getByTestId('toggle-sidebar-btn'));
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

  it('preserves saved customFont when localStorage has a newer pre-bootstrap edit for the active book', async () => {
    const repo = await getDefaultProjectRepository();
    const bookId = asProjectId('book-with-font');
    const olderDbProject = {
      ...BookbinderProjectModel.create(
        BookParametersModel.clampAndNormalize({ pbWidthMm: 140 }),
        CoverStudioModel.createDefault(),
        'Fonted Edition',
      ),
      updatedAt: '2026-10-01T10:00:00.000Z',
    };
    await repo.saveProject({
      id: bookId,
      createdAt: '2026-10-01T09:00:00.000Z',
      updatedAt: olderDbProject.updatedAt,
      project: olderDbProject,
      thumbnailDataUrl: null,
      customFont: {
        familyName: 'BookbinderCustom-Press',
        fileName: 'Press.ttf',
        bytes: new Uint8Array([1, 2, 3, 4]),
        pdfEmbeddable: true,
      },
    });
    await repo.setActiveProjectId(bookId);

    // Simulate a fast local edit saved to localStorage before IndexedDB debounce wrote it
    const newerLocalProject = {
      ...olderDbProject,
      parameters: BookParametersModel.clampAndNormalize({ pbWidthMm: 155 }),
      updatedAt: '2026-10-01T10:05:00.000Z',
    };
    saveProjectToStorage(newerLocalProject);

    render(<App />);

    await waitFor(async () => {
      const saved = await repo.getProject(bookId);
      expect(saved?.project.parameters.pbWidthMm).toBe(155);
      expect(saved?.customFont?.fileName).toBe('Press.ttf');
    });
  });

  it('flushes pending active-book edits before duplicating an inactive book', async () => {
    const user = userEvent.setup();
    const repo = await getDefaultProjectRepository();

    const activeId = asProjectId('book-active');
    const inactiveId = asProjectId('book-inactive');

    const activeProject = {
      ...BookbinderProjectModel.create(
        BookParametersModel.clampAndNormalize({ pbWidthMm: 140 }),
        CoverStudioModel.createDefault(),
        'Active Book',
      ),
      updatedAt: '2026-10-01T10:00:00.000Z',
    };
    const inactiveProject = {
      ...BookbinderProjectModel.create(
        BookParametersModel.clampAndNormalize({ pbWidthMm: 110 }),
        CoverStudioModel.createDefault(),
        'Inactive Book',
      ),
      updatedAt: '2026-10-01T09:00:00.000Z',
    };

    await repo.saveProject({
      id: activeId,
      createdAt: activeProject.updatedAt,
      updatedAt: activeProject.updatedAt,
      project: activeProject,
      thumbnailDataUrl: null,
      customFont: null,
    });
    await repo.saveProject({
      id: inactiveId,
      createdAt: inactiveProject.updatedAt,
      updatedAt: inactiveProject.updatedAt,
      project: inactiveProject,
      thumbnailDataUrl: null,
      customFont: null,
    });
    await repo.setActiveProjectId(activeId);

    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('my-books-count-badge')).toHaveTextContent('2');
    });

    // Edit active book width via expanded sidebar (triggers pending debounced auto-save)
    await user.click(screen.getByTestId('toggle-sidebar-btn'));
    const widthInput = screen.getByTestId('input-pb-width');
    await user.clear(widthInput);
    await user.type(widthInput, '162');

    // Immediately open My Books and duplicate the INACTIVE book
    await user.click(screen.getByTestId('open-my-books-btn'));
    await user.click(screen.getByTestId(`my-books-duplicate-btn-${inactiveId}`));

    await waitFor(async () => {
      const summaries = await repo.listSummaries();
      expect(summaries).toHaveLength(3);
      const savedActive = await repo.getProject(activeId);
      expect(savedActive?.project.parameters.pbWidthMm).toBe(162);
    });
  });
});
