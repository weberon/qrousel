import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { LOGO_WIDTH_RATIO, QR_ERROR_CORRECTION } from './logo';

// jsdom has no TextEncoder, and qrcode reaches for one the moment a payload
// needs byte mode - so a numeric phone number encodes happily here while every
// URL throws. See the same polyfill in App.test.js.
if (typeof global.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

// A logo in the middle of a QR code is deliberate damage. The code still reads
// only because Reed-Solomon reconstructs the modules the logo covers, and how
// much can be covered is a property of the error correction level and the size
// of the code - not something to settle by eye.
//
// So this decodes. It rasterises the module matrix, whites out a centred square
// the way a logo plate does, and asks a real decoder whether the payload
// survives. It is the only test in this repo that can tell you the app still
// works when the app is a camera.
//
// jsQR is not a phone, and a phone is generally the more forgiving of the two -
// it gets many frames, autofocus and exposure. Passing here is evidence, not a
// guarantee; failing here means it is broken everywhere.

const QUIET_ZONE_MODULES = 4;
const PIXELS_PER_MODULE = 8;

/**
 * The code as an RGBA bitmap, with a centred square of `logoRatio` of the image
 * width painted out - which is what a logo plate does to the modules under it.
 */
function render(payload, { errorCorrectionLevel, logoRatio = 0 }) {
  const { modules } = QRCode.create(payload, { errorCorrectionLevel });
  const across = modules.size + QUIET_ZONE_MODULES * 2;
  const width = across * PIXELS_PER_MODULE;

  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  const paint = (x, y, dark) => {
    const i = (y * width + x) * 4;
    const v = dark ? 0 : 255;
    data[i] = data[i + 1] = data[i + 2] = v;
    data[i + 3] = 255;
  };

  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (!modules.data[row * modules.size + col]) continue;
      for (let y = 0; y < PIXELS_PER_MODULE; y++) {
        for (let x = 0; x < PIXELS_PER_MODULE; x++) {
          paint(
            (col + QUIET_ZONE_MODULES) * PIXELS_PER_MODULE + x,
            (row + QUIET_ZONE_MODULES) * PIXELS_PER_MODULE + y,
            true
          );
        }
      }
    }
  }

  const side = Math.round(width * logoRatio);
  const start = Math.round((width - side) / 2);
  for (let y = start; y < start + side; y++) {
    for (let x = start; x < start + side; x++) paint(x, y, false);
  }

  return { data, width };
}

const decodes = (payload, options) => {
  const { data, width } = render(payload, options);
  const result = jsQR(data, width, width);
  return Boolean(result) && result.data === payload;
};

const PAYLOADS = {
  // The smallest code the app produces, and the limiting case: a 21-module
  // matrix leaves the centre close to the timing patterns, which error
  // correction does not cover.
  'a bare phone number': '+15551234567',
  'a short web address': 'https://example.com/a/typical/link',
  'a long web address':
    'https://maps.google.com/?q=12.9716,77.5946&hl=en&z=17&t=m&source=qrousel-entry',
  'a prefilled message': 'sms:+15551234567?body=Hello%20there%2C%20this%20is%20a%20longer%20note',
};

describe('a code with a logo over its middle', () => {
  it.each(Object.entries(PAYLOADS))(
    'still decodes with %s',
    (_label, payload) => {
      expect(
        decodes(payload, {
          errorCorrectionLevel: QR_ERROR_CORRECTION,
          logoRatio: LOGO_WIDTH_RATIO,
        })
      ).toBe(true);
    }
  );

  it.each(Object.entries(PAYLOADS))('decodes without a logo at all with %s', (_label, payload) => {
    expect(decodes(payload, { errorCorrectionLevel: QR_ERROR_CORRECTION })).toBe(true);
  });
});

// The negative half. Without it the tests above would pass just as happily if
// the punch never landed, or if any size at all were survivable - and then they
// would be measuring nothing.
describe('the limit the size was chosen against', () => {
  it('fails once the mark is large enough to matter', () => {
    expect(
      decodes(PAYLOADS['a bare phone number'], {
        errorCorrectionLevel: QR_ERROR_CORRECTION,
        logoRatio: 0.45,
      })
    ).toBe(false);
  });

  // The whole reason for moving the app to level H.
  it('would not survive this mark at the level the app used to generate', () => {
    expect(decodes(PAYLOADS['a long web address'], { errorCorrectionLevel: 'L', logoRatio: 0.3 }))
      .toBe(false);
  });

  it('the chosen level is the strongest one', () => {
    expect(QR_ERROR_CORRECTION).toBe('H');
  });
});
