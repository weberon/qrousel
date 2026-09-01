import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { marked } from 'marked';
import QrContentsDialog from './QrContentsDialog';
import { normalizeHex, textColorFor, canTintQr, isLightBackground } from './background';
import { resolveLogo, QR_ERROR_CORRECTION } from './logo';
import { drawLogoOnQr } from './qrLogo';
import HelpDialog from './HelpDialog';
import VersionFooter from './VersionFooter';
import './ContactCarousel.css';

// A tap must not reveal the QR contents: the carousel swipes on touch, and a
// swipe still emits a click afterwards. On touch only a deliberate press opens
// the dialog; on a mouse a plain click does.
const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE_PX = 10;
// How long after a touch sequence the synthetic click is still ignored. Long
// enough to cover the browser's click delay, short enough that a real mouse
// click on a hybrid device is not swallowed.
const CLICK_AFTER_TOUCH_MS = 600;
const QR_PIXEL_SIZE = 1024;
function ContactCarousel({ contacts, fileName, fileLogo, onLoadFile, onEdit }) {
  const [qrCodes, setQrCodes] = useState([]);
  // Always plain black on white, whatever the screen shows.
  const [printCodes, setPrintCodes] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [descriptionHtml, setDescriptionHtml] = useState(null);
  const [isQrDialogOpen, setIsQrDialogOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const carouselRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const longPressStartRef = useRef(null);
  const clickSuppressTimerRef = useRef(null);
  const isTouchInteractionRef = useRef(false);

  useEffect(() => {
    const generateQRCodes = async () => {
      if (Array.isArray(contacts) && contacts.length > 0) {
        const printable = [];
        const codes = await Promise.all(
          contacts.map(async (contact, index) => {
            try {
              // Rendered at ~80% of the viewport width, so generate well above
              // that: a small raster upscaled on a high-DPI screen blurs the
              // module edges a scanner needs. ~10 KiB per code as a data URL.
              const options = {
                width: QR_PIXEL_SIZE,
                // Level H so a mark in the middle is affordable. Every code is
                // denser for it, whether or not it ends up carrying one.
                errorCorrectionLevel: QR_ERROR_CORRECTION,
              };
              // A pale page can take the quiet zone and light modules, so the
              // code stops being a white square sitting on a colour. Only when
              // the contrast against the black modules survives it - a code a
              // camera cannot read still looks perfectly fine on screen, which
              // is what makes getting this wrong expensive.
              const tint = normalizeHex(contact.background);
              const tinted = Boolean(tint && canTintQr(tint));
              if (tinted) options.color = { light: tint };

              const mark = resolveLogo(contact, fileLogo);
              const code = await drawLogoOnQr(
                await QRCode.toDataURL(contact.url, options),
                mark,
                // The plate takes the tint, so the mark sits in the page rather
                // than in a white hole punched through it.
                { plateColor: tinted ? tint : '#ffffff' }
              );

              if (tinted) {
                // The tint is baked into the PNG, so no stylesheet can take it
                // back out for paper. A plain code is generated alongside it -
                // but only here, since an untinted entry's code is already the
                // one to print and generating it twice would be pure waste.
                const plain = await QRCode.toDataURL(contact.url, {
                  width: QR_PIXEL_SIZE,
                  errorCorrectionLevel: QR_ERROR_CORRECTION,
                });
                printable[index] = await drawLogoOnQr(plain, mark, { plateColor: '#ffffff' });
              } else {
                printable[index] = code;
              }
              return code;
            } catch (error) {
              console.error(`Error generating QR code for ${contact.url}:`, error);
              return '/placeholder.png';
            }
          })
        );
        setQrCodes(codes);
        setPrintCodes(printable);
      }
    };

    generateQRCodes();
  }, [contacts, fileLogo]);

  useEffect(() => {
    setDescriptionHtml(null);
    if (contacts[currentIndex]?.description) {
      setDescriptionHtml(marked.parse(contacts[currentIndex].description));
    }
  }, [currentIndex, contacts]);

  useEffect(() => {
    let touchStartX = 0;
    let touchEndX = 0;

    const handleTouchStart = (e) => {
      touchStartX = e.changedTouches[0].screenX;
    };

    const handleTouchEnd = (e) => {
      touchEndX = e.changedTouches[0].screenX;
      if (touchStartX - touchEndX > 50) {
        showSlide(currentIndex + 1); // Swipe left
      } else if (touchEndX - touchStartX > 50) {
        showSlide(currentIndex - 1); // Swipe right
      }
    };

    const carouselElement = carouselRef.current;
    if (carouselElement && typeof window !== 'undefined') { // Only attach listeners in a browser
      carouselElement.addEventListener('touchstart', handleTouchStart);
      carouselElement.addEventListener('touchend', handleTouchEnd);
    }

    return () => {
      if (carouselElement && typeof window !== 'undefined') {
        carouselElement.removeEventListener('touchstart', handleTouchStart);
        carouselElement.removeEventListener('touchend', handleTouchEnd);
      }
    };
  }, [currentIndex, contacts]);

  const cancelLongPress = () => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartRef.current = null;
  };

  // Clean up anything still pending when the component goes away.
  useEffect(() => {
    return () => {
      cancelLongPress();
      if (clickSuppressTimerRef.current !== null) {
        clearTimeout(clickSuppressTimerRef.current);
      }
    };
  }, []);

  // The dialog shows the URL of the slide it was opened on, so it must not
  // outlive that slide.
  useEffect(() => {
    setIsQrDialogOpen(false);
  }, [currentIndex]);

  const handleQrTouchStart = (e) => {
    isTouchInteractionRef.current = true;
    if (clickSuppressTimerRef.current !== null) {
      clearTimeout(clickSuppressTimerRef.current);
      clickSuppressTimerRef.current = null;
    }

    cancelLongPress();
    const point = e.touches[0];
    longPressStartRef.current = { x: point.clientX, y: point.clientY };
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      setIsQrDialogOpen(true);
    }, LONG_PRESS_MS);
  };

  const handleQrTouchMove = (e) => {
    const start = longPressStartRef.current;
    if (!start) return;
    const point = e.touches[0];
    if (Math.hypot(point.clientX - start.x, point.clientY - start.y) > LONG_PRESS_MOVE_TOLERANCE_PX) {
      cancelLongPress();
    }
  };

  const handleQrTouchEnd = () => {
    cancelLongPress();
    // The click that trails a tap or a swipe must not open the dialog, but a
    // genuine mouse click later on still should.
    clickSuppressTimerRef.current = setTimeout(() => {
      clickSuppressTimerRef.current = null;
      isTouchInteractionRef.current = false;
    }, CLICK_AFTER_TOUCH_MS);
  };

  // Chrome answers a long press on an image with its own menu - save image,
  // open in new tab - drawn as browser chrome above anything the page renders.
  // -webkit-touch-callout only stops that on iOS. Suppress it for touch only,
  // so right-clicking on a desktop still offers Save image as.
  const handleQrContextMenu = (e) => {
    if (isTouchInteractionRef.current) {
      e.preventDefault();
    }
  };

  const handleQrClick = () => {
    if (isTouchInteractionRef.current) return;
    setIsQrDialogOpen(true);
  };

  const showSlide = (index) => {
    if (contacts.length === 0) return;
    if (index < 0) {
      setCurrentIndex(contacts.length - 1);
    } else if (index >= contacts.length) {
      setCurrentIndex(0);
    } else {
      setCurrentIndex(index);
    }
  };

  // Null unless the current entry names a colour this understands, so an entry
  // with no colour and an entry with a broken one both fall through to the
  // stylesheet rather than to a half-applied inline style.
  const background = normalizeHex(contacts[currentIndex]?.background);
  const pageStyle = background
    ? { backgroundColor: background, color: textColorFor(background) }
    : undefined;

  // The dialogs and the footer render inside this element and take their
  // colours from tokens. Left alone those tokens resolve against the phone, so
  // a pale entry on a dark phone would put dark-scheme text on a light page -
  // the version footer ends up at 2.4:1 that way. Forcing the matching theme
  // here re-declares the tokens for the whole subtree, since custom properties
  // inherit. An entry with no colour forces nothing and the phone decides, as
  // it should.
  const themeClass = background ? (isLightBackground(background) ? ' theme-light' : ' theme-dark') : '';

  return (
    <div className={`ContactCarousel${themeClass}`} ref={carouselRef} style={pageStyle}>
      <div className="carousel-main">
        <div className="carousel-item">
          <div className="carousel-content">
            <img
              src={qrCodes[currentIndex] || '/placeholder.png'}
              alt="QR Code"
              className="qr-code"
              draggable={false}
              onClick={handleQrClick}
              onContextMenu={handleQrContextMenu}
              onTouchStart={handleQrTouchStart}
              onTouchMove={handleQrTouchMove}
              onTouchEnd={handleQrTouchEnd}
              onTouchCancel={handleQrTouchEnd}
            />
            {/* Hidden on screen, shown by the print stylesheet in place of the
                one above, which may carry the entry's colour. */}
            <img
              src={printCodes[currentIndex] || qrCodes[currentIndex] || '/placeholder.png'}
              alt=""
              aria-hidden="true"
              className="qr-code-print"
              draggable={false}
            />
            <div
              data-testid="description"
              className="description"
              dangerouslySetInnerHTML={{
                __html: descriptionHtml || 'Loading description...',
              }}
            />
          </div>
        </div>
        <div className="controls">
          <button
            role="button"
            aria-label="Previous slide"
            onClick={() => showSlide(currentIndex - 1)}
          >
            &lt;
          </button>
          <button
            role="button"
            aria-label="Next slide"
            onClick={() => showSlide(currentIndex + 1)}
          >
            &gt;
          </button>
        </div>
      </div>
      <div className="file-actions">
        <button
          className="edit-button"
          aria-label={fileName ? `Edit ${fileName}` : 'Edit'}
          onClick={onEdit}
        >
          <svg className="pencil-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d="M4 20h4L19 9l-4-4L4 16v4Zm13.7-13.3 1.6-1.6a1.4 1.4 0 0 0 0-2l-1.4-1.4a1.4 1.4 0 0 0-2 0l-1.6 1.6 3.4 3.4Z"
              fill="currentColor"
            />
          </svg>
          {fileName ? (
            <span className="edit-button-file" data-testid="file-name">
              {fileName}
            </span>
          ) : (
            <span className="edit-button-file">Edit</span>
          )}
        </button>
        <button onClick={onLoadFile}>Switch</button>
        <button onClick={() => window.print()}>Print</button>
        <button className="help-button" aria-label="Help" onClick={() => setIsHelpOpen(true)}>
          ?
        </button>
      </div>
      <VersionFooter />
      {isHelpOpen && <HelpDialog onClose={() => setIsHelpOpen(false)} />}
      {isQrDialogOpen && (
        <QrContentsDialog
          url={contacts[currentIndex]?.url}
          imageDataUrl={qrCodes[currentIndex]}
          onClose={() => setIsQrDialogOpen(false)}
        />
      )}
    </div>
  );
}

export default ContactCarousel;
