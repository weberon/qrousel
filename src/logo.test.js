import {
  normalizeLogo,
  isLogoValue,
  resolveLogo,
  LOGO_WIDTH_RATIO,
  NO_LOGO,
  QROUSEL_LOGO,
} from './logo';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const JPEG = 'data:image/jpeg;base64,/9j/4AAQ';

describe('normalizeLogo', () => {
  it.each([[PNG], [JPEG], ['data:image/webp;base64,UklGR'], ['data:image/svg+xml,%3Csvg%3E']])(
    'accepts %s',
    (value) => {
      expect(normalizeLogo(value)).toBe(value);
    }
  );

  it('trims a hand-edited value', () => {
    expect(normalizeLogo(`  ${PNG} `)).toBe(PNG);
  });

  it('recognises the opt-out, whatever the case', () => {
    expect(normalizeLogo('none')).toBe(NO_LOGO);
    expect(normalizeLogo('None')).toBe(NO_LOGO);
    expect(normalizeLogo('  NONE ')).toBe(NO_LOGO);
  });

  // A logo carried in the file costs no request and cannot vanish. A remote one
  // would tell someone else's server every time a card is looked at, which is a
  // decision to take deliberately rather than to inherit from a config value.
  it.each([
    ['https://example.com/logo.png'],
    ['http://example.com/logo.png'],
    ['//example.com/logo.png'],
    ['./logo.png'],
    ['data:text/html,<script>alert(1)</script>'],
    ['data:application/pdf;base64,JVBER'],
    ['javascript:alert(1)'],
    ['not a logo'],
    [''],
    ['   '],
    [null],
    [undefined],
    [42],
    [{}],
  ])('refuses %p', (value) => {
    expect(normalizeLogo(value)).toBeNull();
  });
});

describe('isLogoValue', () => {
  // Tells "someone wrote something here that did not work" apart from "there is
  // nothing here", which is the difference between explaining a mistake and
  // ignoring it.
  it('is true for anything written on purpose', () => {
    expect(isLogoValue('https://example.com/logo.png')).toBe(true);
    expect(isLogoValue('nonsense')).toBe(true);
    expect(isLogoValue(PNG)).toBe(true);
  });

  it('is false for nothing at all', () => {
    expect(isLogoValue('')).toBe(false);
    expect(isLogoValue('   ')).toBe(false);
    expect(isLogoValue(undefined)).toBe(false);
    expect(isLogoValue(null)).toBe(false);
  });
});

describe('resolveLogo', () => {
  it('prefers the entry’s own mark', () => {
    expect(resolveLogo({ logo: PNG }, JPEG)).toBe(PNG);
  });

  it('falls back to the file default', () => {
    expect(resolveLogo({}, JPEG)).toBe(JPEG);
  });

  it('falls back to the QRousel mark when neither is set', () => {
    expect(resolveLogo({}, null)).toBe(QROUSEL_LOGO);
    expect(resolveLogo(undefined, undefined)).toBe(QROUSEL_LOGO);
  });

  it('lets an entry opt out entirely', () => {
    expect(resolveLogo({ logo: 'none' }, JPEG)).toBeNull();
  });

  // Otherwise a file that wants bare codes would have to write none on every
  // entry, and adding an entry would silently reintroduce a mark.
  it('lets the file opt out for all of its entries', () => {
    expect(resolveLogo({}, 'none')).toBeNull();
  });

  it('lets one entry keep a mark in a file that opted out', () => {
    expect(resolveLogo({ logo: PNG }, 'none')).toBe(PNG);
  });

  // An unusable value must not become a mark, and must not silently inherit
  // either - falling through is what the default is for.
  it('falls through when the entry’s value is not usable', () => {
    expect(resolveLogo({ logo: 'https://example.com/logo.png' }, JPEG)).toBe(JPEG);
    expect(resolveLogo({ logo: 'nonsense' }, null)).toBe(QROUSEL_LOGO);
  });
});

describe('the QRousel mark', () => {
  it('is an image carried in the code, not a request', () => {
    expect(normalizeLogo(QROUSEL_LOGO)).toBe(QROUSEL_LOGO);
    expect(QROUSEL_LOGO.startsWith('data:image/svg+xml,')).toBe(true);
  });

  it('declares its own size, which canvas needs in order to draw it', () => {
    const svg = decodeURIComponent(QROUSEL_LOGO.replace('data:image/svg+xml,', ''));
    expect(svg).toMatch(/width="\d+"/);
    expect(svg).toMatch(/height="\d+"/);
    expect(svg).toMatch(/viewBox="/);
  });

  // QR detection hunts for the finder patterns' 1:1:3:1:1 ratio. A mark built
  // from rings or nested squares invites a fourth match in the middle of the
  // code, so the shapes here are deliberately offset rather than concentric.
  it('carries no concentric shapes to be mistaken for a finder pattern', () => {
    const svg = decodeURIComponent(QROUSEL_LOGO.replace('data:image/svg+xml,', ''));
    expect(svg).not.toMatch(/<circle/);
    const rects = [...svg.matchAll(/<rect[^>]*x="(\d+)"[^>]*y="(\d+)"/g)];
    expect(rects.length).toBeGreaterThan(1);
    const centres = rects.map(([, x, y]) => `${x},${y}`);
    expect(new Set(centres).size).toBe(centres.length);
  });

  it('holds no script', () => {
    expect(QROUSEL_LOGO.toLowerCase()).not.toContain('script');
    expect(QROUSEL_LOGO.toLowerCase()).not.toContain('onload');
  });
});

describe('LOGO_WIDTH_RATIO', () => {
  // Measured, not chosen: every payload tested still decoded at this size and a
  // short one stopped decoding above it.
  it('is the size every payload survived', () => {
    expect(LOGO_WIDTH_RATIO).toBe(0.2);
  });
});
