import {
  fitWithin,
  readLogoFile,
  LOGO_MAX_PX,
  NOT_AN_IMAGE,
  TOO_LARGE,
  CANNOT_RESIZE,
} from './logoImport';

describe('fitWithin', () => {
  it('leaves a small picture alone', () => {
    expect(fitWithin(100, 80, 256)).toEqual({ width: 100, height: 80 });
  });

  it('shrinks a large one to the box', () => {
    expect(fitWithin(4000, 3000, 256)).toEqual({ width: 256, height: 192 });
  });

  // Stretching somebody's mark into a square is not this code's decision.
  it('keeps the proportions whichever side is longer', () => {
    expect(fitWithin(1000, 4000, 256)).toEqual({ width: 64, height: 256 });
  });

  it('has nothing to say about a picture with no size', () => {
    expect(fitWithin(0, 0, 256)).toEqual({ width: 0, height: 0 });
  });
});

describe('readLogoFile', () => {
  let drawnAt;
  let encodedLength;
  let naturalSize;

  const imageFile = (type = 'image/png') => ({ type, name: 'mark.png' });

  beforeEach(() => {
    drawnAt = [];
    encodedLength = 100;
    naturalSize = [512, 512];

    global.FileReader = class {
      readAsDataURL(file) {
        setTimeout(() => {
          if (file && file.unreadable) this.onerror();
          else {
            this.result = file && file.notAnImage ? 'data:text/plain;base64,x' : 'data:image/png;base64,x';
            this.onload();
          }
        }, 0);
      }
    };

    global.Image = class {
      constructor() {
        [this.naturalWidth, this.naturalHeight] = naturalSize;
        setTimeout(() => (String(this.src).includes('undecodable') ? this.onerror() : this.onload()), 0);
      }
    };

    jest.spyOn(document, 'createElement').mockImplementation(() => ({
      width: 0,
      height: 0,
      getContext: () => ({
        clearRect: () => {},
        drawImage: (image, x, y, w, h) => drawnAt.push({ w, h }),
      }),
      toDataURL: () => 'data:image/png;base64,' + 'a'.repeat(encodedLength),
    }));
  });

  afterEach(() => {
    document.createElement.mockRestore();
    delete global.FileReader;
    delete global.Image;
  });

  it('returns a data url for a picked image', async () => {
    const result = await readLogoFile(imageFile());

    expect(result.ok).toBe(true);
    expect(result.logo.startsWith('data:image/png;base64,')).toBe(true);
  });

  // The point of the whole module: what gets stored is never what was picked.
  it('draws the picture down to the size a mark needs', async () => {
    naturalSize = [4000, 3000];

    await readLogoFile(imageFile());

    expect(drawnAt[0]).toEqual({ w: LOGO_MAX_PX, h: 192 });
  });

  it('leaves a picture already smaller than the box alone', async () => {
    naturalSize = [64, 64];

    await readLogoFile(imageFile());

    expect(drawnAt[0]).toEqual({ w: 64, h: 64 });
  });

  // A mark that will not fit at full size is worth having smaller, rather than
  // refusing somebody's picture outright.
  it('steps down until the result fits', async () => {
    encodedLength = 70 * 1024;

    const result = await readLogoFile(imageFile(), { maxBytes: 60 * 1024 });

    expect(result.ok).toBe(false);
    expect(drawnAt.map((d) => d.w)).toEqual([256, 160, 96]);
  });

  it('gives up when even the smallest will not fit', async () => {
    encodedLength = 70 * 1024;

    const result = await readLogoFile(imageFile(), { maxBytes: 60 * 1024 });

    expect(result).toEqual({ ok: false, reason: TOO_LARGE });
  });

  it('takes the first size that fits and stops there', async () => {
    const result = await readLogoFile(imageFile());

    expect(result.ok).toBe(true);
    expect(drawnAt).toHaveLength(1);
  });

  describe('refusing a file', () => {
    it('that is not an image', async () => {
      expect(await readLogoFile({ type: 'application/pdf' })).toEqual({
        ok: false,
        reason: NOT_AN_IMAGE,
      });
    });

    it('that is nothing at all', async () => {
      expect(await readLogoFile(null)).toEqual({ ok: false, reason: NOT_AN_IMAGE });
    });

    it('that cannot be read', async () => {
      expect(await readLogoFile({ type: 'image/png', unreadable: true })).toEqual({
        ok: false,
        reason: NOT_AN_IMAGE,
      });
    });

    // A file input can lie about its type; what the bytes decode to is what counts.
    it('whose contents turn out not to be an image', async () => {
      expect(await readLogoFile({ type: 'image/png', notAnImage: true })).toEqual({
        ok: false,
        reason: NOT_AN_IMAGE,
      });
    });

    // Storing the original instead would put a photograph in the file, which is
    // the thing this module exists to prevent.
    it('when there is no canvas to resize with', async () => {
      document.createElement.mockImplementation(() => ({ getContext: () => null }));

      expect(await readLogoFile(imageFile())).toEqual({ ok: false, reason: CANNOT_RESIZE });
    });
  });
});
