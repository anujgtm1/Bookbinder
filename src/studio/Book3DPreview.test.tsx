import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { calculateCaseGeometry } from '@/core/geometry';
import { BookParametersModel } from '@/types/bookParams';
import { CoverOrnamentLayerModel, CoverTextLayerModel } from '@/types/coverElements';
import { CoverStudioModel } from '@/types/studio';
import { Book3DPreview } from './Book3DPreview';

describe('Book3DPreview', () => {
  it('renders front, spine (with typography), and back faces and responds to keyboard and pointer orbit', () => {
    const geometry = calculateCaseGeometry(BookParametersModel.createDefault());
    const studio = {
      ...CoverStudioModel.createDefault(),
      spineText: {
        ...CoverStudioModel.createDefault().spineText,
        title: 'Dune',
        author: 'Frank Herbert',
      },
    };
    const onAngleChange = vi.fn();

    render(
      <Book3DPreview
        geometry={geometry}
        studio={studio}
        customFont={null}
        angle={{ yawDeg: 32, pitchDeg: -10 }}
        onAngleChange={onAngleChange}
      />,
    );

    expect(screen.getByTestId('book3d-front-face')).toBeInTheDocument();
    expect(screen.getByTestId('book3d-spine-face')).toBeInTheDocument();
    expect(screen.getByTestId('book3d-back-face')).toBeInTheDocument();
    expect(screen.getByTestId('book3d-spine-typography')).toHaveTextContent('Dune');

    const stage = screen.getByTestId('book3d-stage');
    fireEvent.keyDown(stage, { key: 'ArrowRight' });
    expect(onAngleChange).toHaveBeenCalledWith({ yawDeg: 47, pitchDeg: -10 });

    fireEvent(
      stage,
      new MouseEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 100 }),
    );
    fireEvent(
      stage,
      new MouseEvent('pointermove', { bubbles: true, clientX: 140, clientY: 80 }),
    );
    fireEvent(stage, new MouseEvent('pointerup', { bubbles: true }));
    expect(onAngleChange).toHaveBeenLastCalledWith({ yawDeg: 54, pitchDeg: 1 });
  });

  it('hinges the front cover open to reveal the live styled inner pocket and first page', () => {
    const geometry = calculateCaseGeometry(BookParametersModel.createDefault());
    const studio = {
      ...CoverStudioModel.createDefault(),
      pocketStyle: {
        ...CoverStudioModel.createDefault().pocketStyle,
        backgroundColor: '#1e4d44',
      },
    };

    const { rerender } = render(
      <Book3DPreview
        geometry={geometry}
        studio={studio}
        customFont={null}
        isCoverOpen={false}
      />,
    );

    const hinge = screen.getByTestId('book3d-front-hinge');
    expect(hinge).toHaveAttribute('data-open', 'false');
    expect(hinge.getAttribute('style')).toContain('rotateY(0deg)');
    expect(screen.getByTestId('book3d-inner-pocket-face')).toBeInTheDocument();
    expect(screen.getByTestId('book3d-first-page')).toBeInTheDocument();

    rerender(
      <Book3DPreview
        geometry={geometry}
        studio={studio}
        customFont={null}
        isCoverOpen={true}
      />,
    );
    expect(screen.getByTestId('book3d-front-hinge')).toHaveAttribute('data-open', 'true');
    expect(screen.getByTestId('book3d-front-hinge').getAttribute('style')).toContain(
      'rotateY(-122deg)',
    );
  });

  it('renders cleanly for paperback-wrap (flush edges) and dust-jacket (folded flap) without chipboard hinge grooves', () => {
    const pbGeometry = calculateCaseGeometry({
      ...BookParametersModel.createDefault(),
      bindingStyle: 'paperback-wrap',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 10,
    });
    const studio = CoverStudioModel.createDefault();

    const { rerender } = render(
      <Book3DPreview geometry={pbGeometry} studio={studio} customFont={null} isCoverOpen={true} />,
    );
    expect(screen.getByTestId('book3d-front-face')).toBeInTheDocument();
    expect(screen.getByTestId('book3d-inner-pocket-face')).toBeInTheDocument();
    expect(screen.getByTestId('book3d-first-page').getAttribute('style')).toContain('top: 0px');

    const djGeometry = calculateCaseGeometry({
      ...BookParametersModel.createDefault(),
      bindingStyle: 'dust-jacket',
      pbWidthMm: 105,
      pbHeightMm: 148,
      pbThicknessMm: 10,
      jacketFlapWidthMm: 70,
    });
    rerender(
      <Book3DPreview geometry={djGeometry} studio={studio} customFont={null} isCoverOpen={true} />,
    );
    expect(screen.getByTestId('book3d-front-face')).toBeInTheDocument();
    expect(screen.getByTestId('book3d-spine-face')).toBeInTheDocument();
    expect(screen.getByTestId('book3d-inner-pocket-face')).toBeInTheDocument();
  });

  it('renders non-printing bookcloth/leather surface overlays and hot-stamped gold foil SVG gradients across 3D faces', () => {
    const geometry = calculateCaseGeometry(BookParametersModel.createDefault());
    const frontRect = {
      x: geometry.outerWrap.bleedMm + geometry.outerWrap.frontBoardRect.x,
      y: geometry.outerWrap.bleedMm + geometry.outerWrap.frontBoardRect.y,
      width: geometry.outerWrap.frontBoardRect.width,
      height: geometry.outerWrap.frontBoardRect.height,
    };
    const studio = {
      ...CoverStudioModel.createDefault(),
      spineText: {
        ...CoverStudioModel.createDefault().spineText,
        title: 'Earthsea',
        author: 'Ursula K. Le Guin',
      },
      textLayers: [
        CoverTextLayerModel.createPreset('front-title', frontRect, {
          fontId: 'eb-garamond',
          color: '#f5efe0',
        }),
      ],
      ornaments: [
        CoverOrnamentLayerModel.createForZone('frame-double-rule', frontRect, 'front', '#d4af37'),
      ],
    };

    const { rerender } = render(
      <Book3DPreview
        geometry={geometry}
        studio={studio}
        customFont={null}
        surfaceMaterial="matte-paper"
        foilFinish="ink"
      />,
    );

    expect(screen.queryByTestId('book3d-foil-gradient-front')).not.toBeInTheDocument();
    expect(screen.getByTestId('book3d-front-material-overlay')).toHaveAttribute(
      'data-material',
      'matte-paper',
    );

    rerender(
      <Book3DPreview
        geometry={geometry}
        studio={studio}
        customFont={null}
        surfaceMaterial="bookcloth-linen"
        foilFinish="gold-foil"
      />,
    );

    expect(screen.getByTestId('book3d-front-material-overlay')).toHaveAttribute(
      'data-material',
      'bookcloth-linen',
    );
    expect(screen.getByTestId('book3d-spine-material-overlay')).toHaveAttribute(
      'data-material',
      'bookcloth-linen',
    );
    expect(screen.getByTestId('book3d-back-material-overlay')).toHaveAttribute(
      'data-material',
      'bookcloth-linen',
    );
    expect(screen.getByTestId('book3d-front-material-overlay').getAttribute('style')).toContain(
      'repeating-linear-gradient',
    );

    const frontGrad = screen.getByTestId('book3d-foil-gradient-front');
    const spineGrad = screen.getByTestId('book3d-foil-gradient-spine');
    const backGrad = screen.getByTestId('book3d-foil-gradient-back');
    expect(frontGrad).toHaveAttribute('data-foil-finish', 'gold-foil');
    expect(spineGrad).toHaveAttribute('data-foil-finish', 'gold-foil');
    expect(backGrad).toHaveAttribute('data-foil-finish', 'gold-foil');

    // Spine text, front cover text, and ornament paths reference the injected foil gradient
    const spineTextNode = screen.getByTestId('book3d-spine-typography').querySelector('text');
    expect(spineTextNode?.getAttribute('fill')).toBe(`url(#${spineGrad.getAttribute('id')})`);

    const frontTextNode = screen.getByTestId('book3d-front-face').querySelector('text');
    expect(frontTextNode?.getAttribute('fill')).toBe(`url(#${frontGrad.getAttribute('id')})`);

    const frontOrnamentPath = screen.getByTestId('book3d-front-face').querySelector('path');
    const expectedFrontUrl = `url(#${frontGrad.getAttribute('id')})`;
    expect(
      frontOrnamentPath?.getAttribute('fill') === expectedFrontUrl ||
        frontOrnamentPath?.getAttribute('stroke') === expectedFrontUrl,
    ).toBe(true);

    rerender(
      <Book3DPreview
        geometry={geometry}
        studio={studio}
        customFont={null}
        surfaceMaterial="pebbled-leather"
        foilFinish="gold-foil"
      />,
    );
    expect(screen.getByTestId('book3d-front-material-overlay')).toHaveAttribute(
      'data-material',
      'pebbled-leather',
    );
    expect(screen.getByTestId('book3d-front-material-overlay').getAttribute('style')).toContain(
      'radial-gradient',
    );
  });
});
