import { logoPlacement, drawLogoOnQr, resetCanvasSupportForTests } from './qrLogo';
import { LOGO_WIDTH_RATIO } from './logo';

const QR = 'data:image/png;base64,qr';
const MARK = 'data:image/png;base64,mark';

describe('logoPlacement', () => {
  // The plate is the thing that occludes modules, so the plate - not the mark
  // inside it - is what has to match the ratio the decode test was run at.
  it('sizes the plate to the ratio the code was measured against', () => {
    expect(logoPlacement(1000).plate.size).toBe(1000 * LOGO_WIDTH_RATIO);
  });

  // At 10% padding the rim was a couple of pixels on a phone, so a plate tinted
  // to match the page was indistinguishable from a white one - the colour was
  // applied and could not be seen.
  it('leaves a rim wide enough to see the plate colour', () => {
    const { plate, mark } = logoPlacement(1000);
    const rim = (plate.size - mark.size) / 2;

    expect(rim / plate.size).toBeGreaterThan(0.12);
  });

  it('keeps the mark inside the plate', () => {
    const { plate, mark } = logoPlacement(1000);
    expect(mark.size).toBeLessThan(plate.size);
    expect(mark.x).toBeGreaterThan(plate.x);
    expect(mark.x + mark.size).toBeLessThan(plate.x + plate.size);
  });

  it('centres both', () => {
    const { plate, mark } = logoPlacement(1000);
    expect(plate.x + plate.size / 2).toBeCloseTo(500, 0);
    expect(mark.y + mark.size / 2).toBeCloseTo(500, 0);
    expect(plate.x).toBe(plate.y);
    expect(mark.x).toBe(mark.y);
  });

  it('scales with the code', () => {
    expect(logoPlacement(500).plate.size).toBe(logoPlacement(1000).plate.size / 2);
  });
});

describe('drawLogoOnQr', () => {
  let drawn;
  let filled;
  let exported;
  let images;

  const fakeCanvas = () => ({
    width: 0,
    height: 0,
    getContext: () => ({
      drawImage: (image, x, y, w, h) => drawn.push({ src: image.src, x, y, w, h }),
      fillRect: (x, y, w, h) => filled.push({ colour: exported.fillStyle, x, y, w, h, round: 0 }),
      beginPath: () => {},
      fill: () => {},
      ...(roundRectAvailable
        ? {
            roundRect: (x, y, w, h, r) =>
              filled.push({ colour: exported.fillStyle, x, y, w, h, round: r }),
          }
        : {}),
      set fillStyle(value) {
        exported.fillStyle = value;
      },
      get fillStyle() {
        return exported.fillStyle;
      },
    }),
    toDataURL: () => 'data:image/png;base64,composed',
  });

  let roundRectAvailable;

  beforeEach(() => {
    resetCanvasSupportForTests();
    roundRectAvailable = true;
    drawn = [];
    filled = [];
    exported = {};
    images = [];

    // jsdom never loads an image, so nothing would ever resolve. This stands in
    // for the decoder, and lets a test choose to fail one.
    global.Image = class {
      constructor() {
        images.push(this);
        this.naturalWidth = 400;
        setTimeout(() => {
          if (String(this.src).includes('broken')) this.onerror();
          else this.onload();
        }, 0);
      }
    };
    jest.spyOn(document, 'createElement').mockImplementation((tag) =>
      tag === 'canvas' ? fakeCanvas() : document.createElement.wrappedMethod?.(tag)
    );
  });

  afterEach(() => {
    document.createElement.mockRestore();
    delete global.Image;
    resetCanvasSupportForTests();
  });

  it('returns a new image with the code and the mark drawn on it', async () => {
    const result = await drawLogoOnQr(QR, MARK);

    expect(result).toBe('data:image/png;base64,composed');
    expect(drawn.map((d) => d.src)).toEqual([QR, MARK]);
  });

  it('draws the plate under the mark, at the measured size', async () => {
    await drawLogoOnQr(QR, MARK);

    expect(filled).toHaveLength(1);
    expect(filled[0].w).toBe(400 * LOGO_WIDTH_RATIO);
    const mark = drawn[1];
    expect(mark.w).toBeLessThan(filled[0].w);
  });

  // A square plate reads as a hole punched through the code; a rounded one reads
  // as a badge - and occludes slightly less, so the square the decode test
  // punches stays the conservative measurement.
  it('rounds the plate', async () => {
    await drawLogoOnQr(QR, MARK);

    expect(filled[0].round).toBeGreaterThan(0);
  });

  it('falls back to a square plate where roundRect does not exist', async () => {
    roundRectAvailable = false;

    await drawLogoOnQr(QR, MARK);

    expect(filled).toHaveLength(1);
    expect(filled[0].round).toBe(0);
    expect(filled[0].w).toBe(400 * LOGO_WIDTH_RATIO);
  });

  it('paints the plate white unless told otherwise', async () => {
    await drawLogoOnQr(QR, MARK);

    expect(filled[0].colour).toBe('#ffffff');
  });

  // A tinted code has the page colour in its quiet zone; a white plate would
  // punch a hole through that.
  it('paints the plate in the page colour when the code was tinted', async () => {
    await drawLogoOnQr(QR, MARK, { plateColor: '#f2e6c8' });

    expect(filled[0].colour).toBe('#f2e6c8');
  });

  describe('falling back to the plain code', () => {
    // A missing mark is a blemish. A missing QR code is the whole app.
    it('when no mark was asked for', async () => {
      await expect(drawLogoOnQr(QR, null)).resolves.toBe(QR);
      expect(drawn).toEqual([]);
    });

    it('when there is no code to draw on', async () => {
      await expect(drawLogoOnQr(null, MARK)).resolves.toBeNull();
    });

    it('when the mark will not load', async () => {
      await expect(drawLogoOnQr(QR, 'data:image/png;base64,broken')).resolves.toBe(QR);
    });

    it('when the canvas refuses to export', async () => {
      document.createElement.mockImplementation(() => ({
        ...fakeCanvas(),
        toDataURL: () => {
          throw new Error('SecurityError');
        },
      }));

      await expect(drawLogoOnQr(QR, MARK)).resolves.toBe(QR);
    });

    it('when there is no canvas at all', async () => {
      document.createElement.mockImplementation(() => ({ getContext: () => null }));

      await expect(drawLogoOnQr(QR, MARK)).resolves.toBe(QR);
      expect(drawn).toEqual([]);
    });
  });
});
