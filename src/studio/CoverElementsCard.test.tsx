import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CoverOrnamentLayerModel, CoverTextLayerModel } from '@/types/coverElements';
import { CoverStudioModel } from '@/types/studio';
import { CoverElementsCard } from './CoverElementsCard';

describe('CoverElementsCard', () => {
  it('supports adding Front/Back cover text presets and editing selected text properties', () => {
    const onAddTextPreset = vi.fn();
    const onUpdateTextLayer = vi.fn();
    const onQuickAlignText = vi.fn();
    const onDeleteTextLayer = vi.fn();
    const onCustomFontSelected = vi.fn();

    const frontBoard = { x: 200, y: 21, width: 143, height: 223 };
    const titleLayer = CoverTextLayerModel.createPreset('front-title', frontBoard);
    const studio = {
      ...CoverStudioModel.createDefault(),
      textLayers: [titleLayer],
    };

    render(
      <CoverElementsCard
        studio={studio}
        customFont={{
          familyName: 'BookbinderCustom-MySerif',
          fileName: 'MySerif.ttf',
          bytes: new Uint8Array([1, 2, 3]),
          pdfEmbeddable: true,
        }}
        selectedTextId={titleLayer.id}
        selectedOrnamentId={null}
        onSelectText={vi.fn()}
        onSelectOrnament={vi.fn()}
        onAddTextPreset={onAddTextPreset}
        onUpdateTextLayer={onUpdateTextLayer}
        onQuickAlignText={onQuickAlignText}
        onDeleteTextLayer={onDeleteTextLayer}
        onCustomFontSelected={onCustomFontSelected}
        onAddOrnament={vi.fn()}
        onUpdateOrnament={vi.fn()}
        onScaleOrnament={vi.fn()}
        onFitOrnamentToBoard={vi.fn()}
        onDeleteOrnament={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('add-cover-text-btn'));
    expect(onAddTextPreset).toHaveBeenCalledWith('text');

    fireEvent.click(screen.getByTestId('add-front-title-btn'));
    expect(onAddTextPreset).toHaveBeenCalledWith('front-title');

    // Inline rename directly in the text layer list stays 1:1 with the layer text
    const inlineInput = screen.getByTestId('cover-text-inline-input-0') as HTMLInputElement;
    expect(inlineInput.value).toBe('BOOK TITLE');
    fireEvent.change(inlineInput, { target: { value: 'FIELD NOTES' } });
    expect(onUpdateTextLayer).toHaveBeenCalledWith(titleLayer.id, { text: 'FIELD NOTES' });

    fireEvent.change(screen.getByTestId('cover-text-textarea'), {
      target: { value: 'THE ODYSSEY' },
    });
    expect(onUpdateTextLayer).toHaveBeenCalledWith(titleLayer.id, { text: 'THE ODYSSEY' });

    fireEvent.click(screen.getByRole('button', { name: 'Center' }));
    expect(onQuickAlignText).toHaveBeenCalledWith(titleLayer.id, 'center');

    // Custom font badge & upload input inside Cover Text
    expect(screen.getByTestId('cover-text-custom-font-badge')).toHaveTextContent(
      'Custom: BookbinderCustom-MySerif',
    );
    expect(screen.getByTestId('cover-text-upload-font-btn')).toBeInTheDocument();
    const fontFile = new File([new Uint8Array([1, 2, 3])], 'CustomDisplay.otf', {
      type: 'font/otf',
    });
    fireEvent.change(screen.getByTestId('cover-text-upload-font-input'), {
      target: { files: [fontFile] },
    });
    expect(onCustomFontSelected).toHaveBeenCalledWith(fontFile, titleLayer.id);

    // Flip H / Flip V / Rotate 90° buttons for Cover Text
    fireEvent.click(screen.getByTestId('cover-text-flip-h-btn'));
    expect(onUpdateTextLayer).toHaveBeenCalledWith(titleLayer.id, { flipX: true });
    fireEvent.click(screen.getByTestId('cover-text-flip-v-btn'));
    expect(onUpdateTextLayer).toHaveBeenCalledWith(titleLayer.id, { flipY: true });
    const rotateTextBtn = screen.getByTestId('cover-text-rotate-90-btn');
    expect(rotateTextBtn).toHaveAttribute('aria-pressed', 'false');
    expect(rotateTextBtn).toHaveTextContent('90°');
    fireEvent.click(rotateTextBtn);
    expect(onUpdateTextLayer).toHaveBeenCalledWith(titleLayer.id, { rotationDeg: 90 });
  });

  it('switches to Classic Designs gallery and inserts parametric ornaments', () => {
    const onAddOrnament = vi.fn();
    const onUpdateOrnament = vi.fn();
    const onScaleOrnament = vi.fn();
    const onFitOrnamentWithMargin = vi.fn();
    const onCenterOrnament = vi.fn();
    const frontBoard = { x: 200, y: 21, width: 143, height: 223 };
    const frame = CoverOrnamentLayerModel.createForZone('frame-double-rule', frontBoard, 'front');
    const studio = {
      ...CoverStudioModel.createDefault(),
      ornaments: [frame],
    };

    render(
      <CoverElementsCard
        studio={studio}
        customFont={null}
        selectedTextId={null}
        selectedOrnamentId={frame.id}
        onSelectText={vi.fn()}
        onSelectOrnament={vi.fn()}
        onAddTextPreset={vi.fn()}
        onUpdateTextLayer={vi.fn()}
        onQuickAlignText={vi.fn()}
        onDeleteTextLayer={vi.fn()}
        onAddOrnament={onAddOrnament}
        onUpdateOrnament={onUpdateOrnament}
        onScaleOrnament={onScaleOrnament}
        onFitOrnamentToBoard={vi.fn()}
        onFitOrnamentWithMargin={onFitOrnamentWithMargin}
        onCenterOrnament={onCenterOrnament}
        onDeleteOrnament={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('add-ornament-frame-art-deco'));
    expect(onAddOrnament).toHaveBeenCalledWith('frame-art-deco', 'front', '#d9b566');

    fireEvent.click(screen.getByRole('button', { name: /Scale ornament up/i }));
    expect(onScaleOrnament).toHaveBeenCalledWith(frame.id, 1.1);

    // 1-Click Snap to Margin presets + Center
    fireEvent.click(screen.getByTestId('ornament-fit-tight'));
    expect(onFitOrnamentWithMargin).toHaveBeenCalledWith(frame.id, 6);
    fireEvent.click(screen.getByTestId('ornament-fit-classic'));
    expect(onFitOrnamentWithMargin).toHaveBeenCalledWith(frame.id, 12);
    fireEvent.click(screen.getByTestId('ornament-fit-wide'));
    expect(onFitOrnamentWithMargin).toHaveBeenCalledWith(frame.id, 18);
    fireEvent.click(screen.getByTestId('ornament-center-btn'));
    expect(onCenterOrnament).toHaveBeenCalledWith(frame.id);

    // Flip H / Flip V / Rotate 90° buttons for Ornament / Custom SVG Stamp
    fireEvent.click(screen.getByTestId('ornament-flip-h-btn'));
    expect(onUpdateOrnament).toHaveBeenCalledWith(frame.id, { flipX: true });
    fireEvent.click(screen.getByTestId('ornament-flip-v-btn'));
    expect(onUpdateOrnament).toHaveBeenCalledWith(frame.id, { flipY: true });
    const rotateOrnBtn = screen.getByTestId('ornament-rotate-90-btn');
    expect(rotateOrnBtn).toHaveAttribute('aria-pressed', 'false');
    expect(rotateOrnBtn).toHaveTextContent('90°');
    fireEvent.click(rotateOrnBtn);
    const frameCx = frame.xMm + frame.widthMm / 2;
    const frameCy = frame.yMm + frame.heightMm / 2;
    expect(onUpdateOrnament).toHaveBeenCalledWith(frame.id, {
      xMm: expect.closeTo(frameCx - frame.heightMm / 2, 1),
      yMm: expect.closeTo(frameCy - frame.widthMm / 2, 1),
      widthMm: frame.heightMm,
      heightMm: frame.widthMm,
      rotationDeg: 90,
    });
  });
});
