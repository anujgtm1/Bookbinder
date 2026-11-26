import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { getBindingStyleSpec } from '@/resources/paperSpecs';
import { asProjectId, type SavedProjectSummary } from '@/types/projectLibrary';
import { MyBooksDialog, type MyBooksDialogProps } from './MyBooksDialog';

function createSummary(
  id: string,
  overrides: Partial<SavedProjectSummary> = {},
): SavedProjectSummary {
  return {
    id: asProjectId(id),
    name: 'Test Book',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-02T14:30:00.000Z',
    bindingStyle: 'rigid-case',
    pbWidthMm: 140,
    pbHeightMm: 216,
    pbThicknessMm: 24,
    wrapPdfWidthMm: 368,
    wrapPdfHeightMm: 265,
    thumbnailDataUrl: null,
    hasCustomFont: false,
    ...overrides,
  };
}

function createProps(overrides: Partial<MyBooksDialogProps> = {}): MyBooksDialogProps {
  return {
    open: true,
    summaries: [
      createSummary('book-alpha', {
        name: 'Book Alpha',
        bindingStyle: 'rigid-case',
        pbWidthMm: 140,
        pbHeightMm: 216,
        pbThicknessMm: 24,
        thumbnailDataUrl: 'data:image/jpeg;base64,ZmFrZQ==',
        hasCustomFont: true,
      }),
      createSummary('book-beta', {
        name: 'Book Beta',
        bindingStyle: 'softcover-jacket',
        pbWidthMm: 105,
        pbHeightMm: 148,
        pbThicknessMm: 14,
        thumbnailDataUrl: null,
        hasCustomFont: false,
      }),
    ],
    activeProjectId: asProjectId('book-alpha'),
    unit: 'mm',
    storageKind: 'indexeddb',
    onSelectBook: vi.fn(),
    onNewBook: vi.fn(),
    onLoadSampleBook: vi.fn(),
    onRenameBook: vi.fn(),
    onDuplicateBook: vi.fn(),
    onDeleteBook: vi.fn(),
    onExportBookJson: vi.fn(),
    onExportAllJson: vi.fn(),
    onImportJson: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe('MyBooksDialog', () => {
  it('renders native modal dialog, saved book summaries, active badge, dimensions, and storage notice', () => {
    const props = createProps({ storageKind: 'fallback', unit: 'mm' });
    render(<MyBooksDialog {...props} />);

    const dialog = screen.getByTestId('my-books-dialog');
    expect(dialog).toHaveAttribute('open');
    expect(dialog).toHaveAttribute('closedby', 'any');
    expect(dialog).not.toHaveAttribute('role');
    expect(dialog).not.toHaveAttribute('aria-modal');
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();

    const items = screen.getAllByTestId('my-books-item');
    expect(items).toHaveLength(2);

    // Active badge on active book only; Open button only on inactive book
    expect(screen.getByTestId('my-books-active-badge')).toHaveTextContent('Active');
    expect(screen.queryByTestId('my-books-open-btn-book-alpha')).not.toBeInTheDocument();
    expect(screen.getByTestId('my-books-open-btn-book-beta')).toBeInTheDocument();

    // Cover preview thumbnail rendered for Book Alpha
    expect(screen.getByAltText('Cover preview for Book Alpha')).toHaveAttribute(
      'src',
      'data:image/jpeg;base64,ZmFrZQ==',
    );

    // Canonical binding style labels & formatted W x H x Spine dimensions
    expect(screen.getByTestId('my-books-dims-book-alpha')).toHaveTextContent(
      '140.0 × 216.0 × 24.0 mm',
    );
    expect(screen.getByTestId('my-books-dims-book-beta')).toHaveTextContent(
      '105.0 × 148.0 × 14.0 mm',
    );
    expect(screen.getByText(getBindingStyleSpec('rigid-case').shortLabel)).toBeInTheDocument();
    expect(
      screen.getByText(getBindingStyleSpec('softcover-jacket').shortLabel),
    ).toBeInTheDocument();

    // Footer local-save guidance and fallback warning banner
    expect(
      screen.getByText(/Saved locally in this browser\. Export a backup \(\.json\)/i),
    ).toBeInTheDocument();
    expect(screen.getByTestId('my-books-fallback-warning')).toBeInTheDocument();
  });

  it('triggers toolbar actions: New Book, Sample Book, Backup All, and Import .json', async () => {
    const user = userEvent.setup();
    const props = createProps();
    render(<MyBooksDialog {...props} />);

    expect(screen.queryByTestId('my-books-fallback-warning')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('my-books-new-btn'));
    expect(props.onNewBook).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('my-books-sample-btn'));
    expect(props.onLoadSampleBook).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('my-books-export-all-btn'));
    expect(props.onExportAllJson).toHaveBeenCalledTimes(1);

    const file = new File(['{"projects":[]}'], 'backup.json', { type: 'application/json' });
    const importInput = screen.getByTestId('my-books-import-input');
    await user.upload(importInput, file);
    await waitFor(() => {
      expect(props.onImportJson).toHaveBeenCalledWith(file);
    });
  });

  it('supports inline rename (save via button & Enter, cancel via button & Escape without closing dialog)', async () => {
    const user = userEvent.setup();
    const props = createProps();
    render(<MyBooksDialog {...props} />);

    // 1. Start rename and cancel via Escape
    await user.click(screen.getByTestId('my-books-rename-btn-book-alpha'));
    const input = screen.getByTestId('my-books-rename-input');
    expect(input).toHaveValue('Book Alpha');
    await user.clear(input);
    await user.type(input, 'Draft Ignored');
    await user.keyboard('{Escape}');

    expect(screen.queryByTestId('my-books-rename-input')).not.toBeInTheDocument();
    expect(props.onRenameBook).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();

    // 2. Start rename and cancel via Cancel button
    await user.click(screen.getByTestId('my-books-rename-btn-book-alpha'));
    await user.click(screen.getByTestId('my-books-rename-cancel-btn'));
    expect(screen.queryByTestId('my-books-rename-input')).not.toBeInTheDocument();
    expect(props.onRenameBook).not.toHaveBeenCalled();

    // 3. Start rename and commit with Save button
    await user.click(screen.getByTestId('my-books-rename-btn-book-alpha'));
    const input2 = screen.getByTestId('my-books-rename-input');
    await user.clear(input2);
    await user.type(input2, '  Collected Essays  ');
    await user.click(screen.getByTestId('my-books-rename-save-btn'));

    expect(props.onRenameBook).toHaveBeenCalledWith(asProjectId('book-alpha'), 'Collected Essays');

    // 4. Commit with Enter key
    await user.click(screen.getByTestId('my-books-rename-btn-book-beta'));
    const input3 = screen.getByTestId('my-books-rename-input');
    await user.clear(input3);
    await user.type(input3, 'Pocket Field Guide{Enter}');

    expect(props.onRenameBook).toHaveBeenCalledWith(asProjectId('book-beta'), 'Pocket Field Guide');
  });

  it('handles Open, Duplicate, Export .json, and 2-step inline Delete confirmation', async () => {
    const user = userEvent.setup();
    const props = createProps();
    render(<MyBooksDialog {...props} />);

    await user.click(screen.getByTestId('my-books-open-btn-book-beta'));
    expect(props.onSelectBook).toHaveBeenCalledWith(asProjectId('book-beta'));

    await user.click(screen.getByTestId('my-books-duplicate-btn-book-alpha'));
    expect(props.onDuplicateBook).toHaveBeenCalledWith(asProjectId('book-alpha'));

    await user.click(screen.getByTestId('my-books-export-btn-book-beta'));
    expect(props.onExportBookJson).toHaveBeenCalledWith(asProjectId('book-beta'));

    // First click opens inline confirmation without deleting immediately
    await user.click(screen.getByTestId('my-books-delete-btn-book-beta'));
    expect(props.onDeleteBook).not.toHaveBeenCalled();
    expect(screen.getByTestId('my-books-delete-confirm-book-beta')).toBeInTheDocument();

    // Cancel aborts deletion
    await user.click(screen.getByTestId('my-books-cancel-delete-btn-book-beta'));
    expect(screen.queryByTestId('my-books-delete-confirm-book-beta')).not.toBeInTheDocument();
    expect(props.onDeleteBook).not.toHaveBeenCalled();

    // Confirm Delete invokes callback
    await user.click(screen.getByTestId('my-books-delete-btn-book-beta'));
    await user.click(screen.getByTestId('my-books-confirm-delete-btn-book-beta'));
    expect(props.onDeleteBook).toHaveBeenCalledWith(asProjectId('book-beta'));
  });
});
