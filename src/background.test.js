import {
  normalizeHex,
  isLightBackground,
  contrastRatio,
  backgroundLabel,
  relativeLuminance,
  textColorFor,
  canTintQr,
  BACKGROUND_PRESETS,
} from './background';

// Perceptual distance in OKLab. Roughly, 0.02 is the threshold of noticing and
// 0.1 is plainly a different colour. Lives here rather than in the app because
// nothing the app does at runtime needs it - it exists to hold the palette to a
// standard that "looks fine to me" cannot.
const oklab = (hex) => {
  const [r, g, b] = [1, 3, 5]
    .map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
};

const distance = (a, b) => {
  const [al, aa, ab] = oklab(a);
  const [bl, ba, bb] = oklab(b);
  return Math.hypot(al - bl, aa - ba, ab - bb);
};

describe('normalizeHex', () => {
  it('accepts a six digit colour', () => {
    expect(normalizeHex('#1d3557')).toBe('#1d3557');
  });

  it('expands a three digit colour', () => {
    expect(normalizeHex('#abc')).toBe('#aabbcc');
  });

  it('lowercases, so two spellings of one colour compare equal', () => {
    expect(normalizeHex('#1D3557')).toBe('#1d3557');
  });

  it('tolerates surrounding whitespace from a hand-edited file', () => {
    expect(normalizeHex('  #1d3557 ')).toBe('#1d3557');
  });

  // Anything that is not a colour must come back null rather than reaching a
  // style attribute. The regex cannot match a semicolon, a quote or a bracket,
  // which is what makes a css value built from it safe.
  it.each([
    ['navy'],
    ['rgb(29, 53, 87)'],
    ['#12345'],
    ['#1234567'],
    ['#nothex'],
    ['1d3557'],
    ['#fff; background: url(evil)'],
    ['#fff") ; color: red; ("'],
    ['url(evil)'],
    [''],
    ['   '],
    [null],
    [undefined],
    [42],
    [{}],
  ])('rejects %p', (value) => {
    expect(normalizeHex(value)).toBeNull();
  });
});

describe('relativeLuminance', () => {
  it('is 1 for white and 0 for black', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
  });

  // Green contributes most to perceived brightness, blue least - a mid grey is
  // not the midpoint between a pure green and a pure blue.
  it('weights the channels the way an eye does', () => {
    expect(relativeLuminance('#00ff00')).toBeGreaterThan(relativeLuminance('#ff0000'));
    expect(relativeLuminance('#ff0000')).toBeGreaterThan(relativeLuminance('#0000ff'));
  });
});

describe('textColorFor', () => {
  it('puts dark text on a light background', () => {
    expect(textColorFor('#ffffff')).toBe('#111111');
    expect(textColorFor('#ffe8d6')).toBe('#111111');
  });

  it('puts light text on a dark background', () => {
    expect(textColorFor('#000000')).toBe('#ffffff');
    expect(textColorFor('#1d3557')).toBe('#ffffff');
  });

  // Black and white text contrast equally at a luminance of about 0.179, so the
  // choice has to flip across that value rather than at a naive 0.5.
  it('flips at the luminance where the two are equally readable', () => {
    // Adjacent greys, one step apart, either side of the crossover. Nothing
    // between them to hide a wrong threshold in.
    const justBelow = '#757575'; // luminance 0.17789
    const justAbove = '#767676'; // luminance 0.18116
    expect(relativeLuminance(justBelow)).toBeLessThan(0.1791);
    expect(relativeLuminance(justAbove)).toBeGreaterThan(0.1791);
    expect(textColorFor(justBelow)).toBe('#ffffff');
    expect(textColorFor(justAbove)).toBe('#111111');
  });

  it('has no opinion about a colour it does not understand', () => {
    expect(textColorFor('navy')).toBeNull();
    expect(textColorFor(null)).toBeNull();
  });
});

describe('isLightBackground', () => {
  it('recognises a light page', () => {
    expect(isLightBackground('#ffffff')).toBe(true);
    expect(isLightBackground('#ffe8d6')).toBe(true);
  });

  it('recognises a dark page', () => {
    expect(isLightBackground('#000000')).toBe(false);
    expect(isLightBackground('#1d3557')).toBe(false);
  });

  // Shares its threshold with textColorFor: the two must never disagree, or a
  // page would get light-scheme tokens and dark text.
  it('agrees with the text colour at the boundary', () => {
    expect(isLightBackground('#757575')).toBe(false);
    expect(textColorFor('#757575')).toBe('#ffffff');
    expect(isLightBackground('#767676')).toBe(true);
    expect(textColorFor('#767676')).toBe('#111111');
  });

  it('has no answer for a colour it cannot measure', () => {
    expect(isLightBackground('navy')).toBeNull();
  });
});

describe('canTintQr', () => {
  // Tinting recolours the quiet zone and light modules. It is only safe while
  // the result still contrasts hard against the black modules - a scanner
  // failing is worse than a white square looking a bit abrupt.
  it('allows a pale background', () => {
    expect(canTintQr('#ffffff')).toBe(true);
    expect(canTintQr('#ffe8d6')).toBe(true);
  });

  it('refuses a dark background, which would leave black on near-black', () => {
    expect(canTintQr('#1d3557')).toBe(false);
    expect(canTintQr('#000000')).toBe(false);
  });

  it('refuses a mid tone, where contrast is merely adequate for text', () => {
    // Readable behind text, nowhere near the margin a camera wants.
    expect(canTintQr('#8a8a8a')).toBe(false);
  });

  // Adjacent greys either side of the threshold, so a moved threshold cannot
  // slip through between two comfortable examples.
  it('draws the line between two greys one step apart', () => {
    expect(relativeLuminance('#bbbbbb')).toBeLessThan(0.5); // 0.49693
    expect(relativeLuminance('#bcbcbc')).toBeGreaterThan(0.5); // 0.50289
    expect(canTintQr('#bbbbbb')).toBe(false);
    expect(canTintQr('#bcbcbc')).toBe(true);
  });

  it('refuses anything it cannot measure', () => {
    expect(canTintQr('navy')).toBe(false);
    expect(canTintQr(null)).toBe(false);
  });
});

describe('BACKGROUND_PRESETS', () => {
  it('offers a handful of choices', () => {
    expect(BACKGROUND_PRESETS.length).toBeGreaterThanOrEqual(5);
  });

  it('are all valid colours', () => {
    BACKGROUND_PRESETS.forEach((preset) => {
      expect(normalizeHex(preset.value)).toBe(preset.value);
    });
  });

  // Every preset used to be pale enough for the QR to tint into, which sounded
  // tidy and made them all near-white and indistinguishable from having no
  // background at all. Range matters more than seamlessness.
  it('offers colours you can actually see against a plain page', () => {
    BACKGROUND_PRESETS.forEach((preset) => {
      expect(distance(preset.value, '#ffffff')).toBeGreaterThan(0.06);
    });
  });

  // Every preset tints, so tapping one never leaves the code sitting on a white
  // square. That is not a return to the old all-pale set: those failed by being
  // indistinguishable from a white page, which the test above now forbids.
  // Luminance weights green at 0.72 and blue at 0.07, so a yellow or a green can
  // be saturated and still clear the bar.
  it('all clear the threshold for the code to take the page colour', () => {
    BACKGROUND_PRESETS.forEach((preset) => {
      expect(canTintQr(preset.value)).toBe(true);
    });
  });

  // Deliberately not contrastRatio: that measures lightness alone, so a green
  // and a blue of the same lightness score 1.02:1 while being obviously
  // different colours. Telling two swatches apart is a question about hue as
  // much as brightness, which is what a perceptual distance answers.
  it('are distinguishable from one another', () => {
    BACKGROUND_PRESETS.forEach((a, i) => {
      BACKGROUND_PRESETS.slice(i + 1).forEach((b) => {
        expect(distance(a.value, b.value)).toBeGreaterThan(0.04);
      });
    });
  });

  // Whatever the colour, the text the app puts on it has to be readable. AA for
  // body text is 4.5:1.
  it('all take readable text', () => {
    BACKGROUND_PRESETS.forEach((preset) => {
      expect(contrastRatio(textColorFor(preset.value), preset.value)).toBeGreaterThan(4.5);
    });
  });

  it('each carry a name, for the button label', () => {
    BACKGROUND_PRESETS.forEach((preset) => {
      expect(typeof preset.name).toBe('string');
      expect(preset.name.length).toBeGreaterThan(0);
    });
  });
});

describe('backgroundLabel', () => {
  it('names a preset', () => {
    expect(backgroundLabel(BACKGROUND_PRESETS[0].value)).toBe(BACKGROUND_PRESETS[0].name);
  });

  it('names a preset written in shorthand or upper case', () => {
    const upper = BACKGROUND_PRESETS[0].value.toUpperCase();
    expect(backgroundLabel(upper)).toBe(BACKGROUND_PRESETS[0].name);
  });

  // A colour from the picker has no name worth inventing; the code itself is
  // the useful thing to show, since it is what someone would have to type.
  it('falls back to the colour itself for anything else', () => {
    expect(backgroundLabel('#123456')).toBe('#123456');
  });

  it('says none when there is no usable colour', () => {
    expect(backgroundLabel(null)).toBe('none');
    expect(backgroundLabel(undefined)).toBe('none');
    expect(backgroundLabel('navy')).toBe('none');
    expect(backgroundLabel('')).toBe('none');
  });
});

describe('contrastRatio', () => {
  it('is 21:1 between black and white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });

  it('is 1:1 for a colour against itself', () => {
    expect(contrastRatio('#1d3557', '#1d3557')).toBeCloseTo(1, 5);
  });

  it('does not care which way round the two are given', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBe(contrastRatio('#ffffff', '#000000'));
  });

  it('is null when either colour cannot be measured', () => {
    expect(contrastRatio('navy', '#ffffff')).toBeNull();
    expect(contrastRatio('#ffffff', null)).toBeNull();
  });
});
