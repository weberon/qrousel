import { LOGO_WIDTH_RATIO } from './logo';

// The mark sits on a plate so it is never fighting the modules behind it. The
// plate is what actually occludes the code, so *the plate* is what is held to
// LOGO_WIDTH_RATIO - the mark is smaller still. Sizing the mark at the measured
// ratio and then adding a plate around it would put the real occlusion at 25%,
// past what a short payload survives.
const PLATE_PADDING = 0.1;

/**
 * Where the plate and the mark go on a square code of `imageWidth` pixels.
 * Pure, because these are the numbers that decide whether the code still
 * scans - the drawing that follows is only obeying them.
 */
export function logoPlacement(imageWidth) {
  const plate = Math.round(imageWidth * LOGO_WIDTH_RATIO);
  const mark = Math.round(plate * (1 - PLATE_PADDING * 2));
  const centre = (size) => Math.round((imageWidth - size) / 2);
  return {
    plate: { size: plate, x: centre(plate), y: centre(plate) },
    mark: { size: mark, x: centre(mark), y: centre(mark) },
  };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image could not be loaded'));
    image.src = src;
  });
}

// Asked once rather than per code: jsdom answers by logging that canvas is not
// implemented, and a hundred of those would bury everything else in a test run.
let canvasAvailable = null;
function canDraw() {
  if (canvasAvailable === null) {
    try {
      const canvas = document.createElement('canvas');
      canvasAvailable = Boolean(canvas.getContext && canvas.getContext('2d'));
    } catch (e) {
      canvasAvailable = false;
    }
  }
  return canvasAvailable;
}

export function resetCanvasSupportForTests() {
  canvasAvailable = null;
}

/**
 * The code with a mark drawn over its middle, as a new data URL.
 *
 * Returns the code untouched whenever it cannot do better - no mark asked for,
 * no canvas to draw on, a mark that will not load, a canvas that refuses to
 * export. A missing logo is a blemish; a missing QR code is the whole app, so
 * every failure here falls back rather than propagating.
 */
export async function drawLogoOnQr(qrDataUrl, logoDataUrl, { plateColor = '#ffffff' } = {}) {
  if (!qrDataUrl || !logoDataUrl || !canDraw()) return qrDataUrl;

  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return qrDataUrl;

    const code = await loadImage(qrDataUrl);
    const width = code.naturalWidth || code.width;
    if (!width) return qrDataUrl;

    canvas.width = width;
    canvas.height = width;
    context.drawImage(code, 0, 0, width, width);

    const mark = await loadImage(logoDataUrl);
    const { plate, mark: markBox } = logoPlacement(width);

    // The plate takes the page colour when the code was tinted to match it, so
    // the mark sits in the page rather than in a white hole punched through it.
    context.fillStyle = plateColor;
    context.fillRect(plate.x, plate.y, plate.size, plate.size);
    context.drawImage(mark, markBox.x, markBox.y, markBox.size, markBox.size);

    return canvas.toDataURL('image/png');
  } catch (e) {
    // Includes the SecurityError a tainted canvas throws on export, which an
    // SVG mark can still provoke in some browsers.
    return qrDataUrl;
  }
}
