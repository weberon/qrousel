// The mark that sits in the middle of a QR code, and the rules for deciding
// which one an entry gets.

// The level every code is generated at. It lives here rather than with the
// generator because the reason for it is the logo: level H reserves the most
// room for reconstruction, which is what pays for the modules a mark covers.
// Codes are denser for it - a long URL goes from 37 modules to 49 - which is a
// real cost on a small screen, paid deliberately.
export const QR_ERROR_CORRECTION = 'H';

// A logo is deliberate damage: the modules it covers are gone, and the code
// only still reads because error correction reconstructs them. 20% of the
// image width was measured rather than guessed - at error correction level H a
// short URL survives 30% and a long one 35%, but a bare phone number makes a
// 21-module code where a centre patch starts reaching the timing patterns, and
// no amount of error correction recovers those. 20% is what every payload
// tolerated.
export const LOGO_WIDTH_RATIO = 0.2;

// What an entry writes to say "no mark at all", overriding the file's default.
// Anything the file can set has to be unsettable, or a default becomes a trap.
export const NO_LOGO = 'none';

// Drawn here rather than shipped as a file so it costs no request and cannot go
// missing. Deliberately not concentric: QR detection hunts for the 1:1:3:1:1
// ratio of the finder patterns, and a mark built from rings or nested squares
// risks reading as a fourth one. Two offset cards are asymmetric, which that
// search has no interest in.
export const QROUSEL_LOGO =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">' +
      '<rect width="64" height="64" rx="14" fill="#111111"/>' +
      '<rect x="26" y="13" width="25" height="25" rx="7" fill="none" stroke="#ffffff" ' +
      'stroke-width="3" opacity="0.55"/>' +
      '<rect x="13" y="26" width="25" height="25" rx="7" fill="#ffffff"/>' +
      '</svg>'
  );

// Only images, and only ones carried in the file itself. An http(s) logo would
// mean every viewing of a card pings someone else's server, which is a thing to
// choose deliberately rather than to inherit from a URL in a config.
const DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp|svg\+xml)[;,]/i;

/**
 * What a stored logo value means: the image itself, the NO_LOGO sentinel, or
 * null for "nothing usable here" - which covers an absent key and a value this
 * does not understand alike, because neither should reach an img tag.
 */
export function normalizeLogo(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === NO_LOGO) return NO_LOGO;
  return DATA_IMAGE.test(trimmed) ? trimmed : null;
}

/**
 * Whether a value was *meant* as a logo, however badly. Distinguishes a key
 * holding something unusable from a key that was never there - which is what an
 * editor needs in order to say why nothing happened, rather than silently
 * ignoring a line someone wrote on purpose.
 */
export function isLogoValue(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * The mark an entry actually gets: its own, else the file's default, else the
 * QRousel one. Either level may opt out with 'none', and an entry opting out
 * beats a file that set one.
 */
export function resolveLogo(entry, fileLogo) {
  const own = normalizeLogo(entry && entry.logo);
  if (own === NO_LOGO) return null;
  if (own) return own;

  const shared = normalizeLogo(fileLogo);
  if (shared === NO_LOGO) return null;
  if (shared) return shared;

  return QROUSEL_LOGO;
}
