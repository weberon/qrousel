// Turning a file somebody picked into something small enough to live inside a
// qrdata file.
//
// The whole file is carried in the YAML and mirrored into localStorage, which
// is a few megabytes for the whole origin. A phone photo is four of those on
// its own, so an image is never stored as picked: it is drawn down to a size a
// logo actually needs and re-encoded.

export const LOGO_MAX_PX = 256;

// Of the data URL, which is what actually gets stored - base64 is about a third
// larger than the bytes it encodes. A 256px mark lands far below this; the cap
// is for the photograph somebody picks by mistake.
export const LOGO_MAX_BYTES = 60 * 1024;

// Tried in order until one fits. Falling back to a smaller mark keeps a
// picture usable rather than refusing it outright.
const FALLBACK_SIZES = [LOGO_MAX_PX, 160, 96];

export const NOT_AN_IMAGE = 'not-an-image';
export const TOO_LARGE = 'too-large';
export const CANNOT_RESIZE = 'cannot-resize';

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('unreadable'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('not decodable'));
    image.src = src;
  });
}

/**
 * The largest box of at most `maxPx` that keeps the picture's proportions. A
 * mark is usually square, but nothing says it has to be, and stretching
 * somebody's logo to fit a square is not this code's decision to make.
 */
export function fitWithin(width, height, maxPx) {
  if (!width || !height) return { width: 0, height: 0 };
  const scale = Math.min(1, maxPx / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Read a picked file into a data URL small enough to store, or say why not.
 *
 * Always `{ ok }`, never a throw: this runs from a file input, where every
 * failure is something to tell the person who just picked a file.
 */
export async function readLogoFile(file, { maxBytes = LOGO_MAX_BYTES } = {}) {
  if (!file || !String(file.type || '').startsWith('image/')) {
    return { ok: false, reason: NOT_AN_IMAGE };
  }

  let source;
  try {
    source = await readAsDataUrl(file);
  } catch (e) {
    return { ok: false, reason: NOT_AN_IMAGE };
  }
  if (!String(source).startsWith('data:image/')) return { ok: false, reason: NOT_AN_IMAGE };

  let image;
  let canvas;
  try {
    image = await loadImage(source);
    canvas = document.createElement('canvas');
    if (!canvas.getContext || !canvas.getContext('2d')) throw new Error('no canvas');
  } catch (e) {
    // Nothing can be resized here. Storing the original would put a photograph
    // in the file, which is the thing this exists to prevent.
    return { ok: false, reason: CANNOT_RESIZE };
  }

  for (const size of FALLBACK_SIZES) {
    const box = fitWithin(image.naturalWidth || image.width, image.naturalHeight || image.height, size);
    if (!box.width) return { ok: false, reason: NOT_AN_IMAGE };

    try {
      canvas.width = box.width;
      canvas.height = box.height;
      const context = canvas.getContext('2d');
      context.clearRect(0, 0, box.width, box.height);
      context.drawImage(image, 0, 0, box.width, box.height);
      // PNG rather than JPEG: a mark that cannot have a transparent background
      // arrives with a white box around it, which on a tinted code is exactly
      // the hole the plate exists to avoid.
      const encoded = canvas.toDataURL('image/png');
      if (encoded.length <= maxBytes) return { ok: true, logo: encoded, width: box.width };
    } catch (e) {
      return { ok: false, reason: CANNOT_RESIZE };
    }
  }

  return { ok: false, reason: TOO_LARGE };
}
