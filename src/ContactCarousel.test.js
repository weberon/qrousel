import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import QRCode from 'qrcode';
import ContactCarousel from './ContactCarousel';

jest.mock('qrcode', () => ({
  toDataURL: jest.fn(() => Promise.resolve('data:image/png;base64,mock-qr-code')),
}));

// Polyfill TextEncoder and TextDecoder (DEFINITELY before any qrcode usage)
if (typeof global.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

describe('ContactCarousel', () => {
  beforeEach(() => {
    // Create React App sets resetMocks: true, which strips the implementation
    // given in the jest.mock factory before every test. Without this the mock
    // resolves undefined and every QR code silently falls back to the
    // placeholder image.
    QRCode.toDataURL.mockResolvedValue('data:image/png;base64,mock-qr-code');
  });

  const renderWithContacts = async (data, props = {}) => {
    await act(async () => {
      render(
        <ContactCarousel contacts={data} onLoadFile={() => {}} onEdit={() => {}} {...props} />
      );
    });
    await screen.findByText(data[0].description);
  };

  // One act() per click: batching several clicks into a single act() makes every
  // handler read the same stale currentIndex, so the component never passes
  // through the intermediate slides.
  const clickControl = async (name) => {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name }));
    });
  };

  const clickNext = () => clickControl(/Next slide/i);
  const clickPrevious = () => clickControl(/Previous slide/i);

  // Assert the expected slide is showing and, just as importantly, that none of
  // the other slides are.
  const expectSlide = (data, index) => {
    expect(screen.getByText(data[index].description)).toBeInTheDocument();
    data.forEach((contact, i) => {
      if (i !== index) {
        expect(screen.queryByText(contact.description)).not.toBeInTheDocument();
      }
    });
  };

  it('renders the first contact on initial render', async () => {
    const mockContactsData = [
      { url: 'https://example.com/test1', description: 'Test Description 1' },
      { url: 'https://example.com/test2', description: 'Test Description 2' },
    ];
    await renderWithContacts(mockContactsData);

    expectSlide(mockContactsData, 0);
  });

  it('displays the next contact when the "Next" button is clicked', async () => {
    const mockContactsData = [
      { url: 'https://example.com/test1', description: 'Test Description 1' },
      { url: 'https://example.com/test2', description: 'Test Description 2' },
    ];
    await renderWithContacts(mockContactsData);

    await clickNext();

    expectSlide(mockContactsData, 1);
  });

  it('displays the previous contact when the "Previous" button is clicked', async () => {
    const mockContactsData = [
      { url: 'https://example.com/test1', description: 'Test Description 1' },
      { url: 'https://example.com/test2', description: 'Test Description 2' },
    ];
    await renderWithContacts(mockContactsData);

    await clickNext(); // Go to the second contact first
    expectSlide(mockContactsData, 1);

    await clickPrevious();

    expectSlide(mockContactsData, 0);
  });

  it('wraps around to the first contact from the last', async () => {
    const longMockContactsData = [
      { url: 'https://example.com/test1', description: 'Test Description 1' },
      { url: 'https://example.com/test2', description: 'Test Description 2' },
      { url: 'https://example.com/test3', description: 'Test Description 3' },
    ];
    await renderWithContacts(longMockContactsData);

    // Navigate to the last contact
    for (let i = 0; i < longMockContactsData.length - 1; i++) {
      await clickNext();
    }
    expectSlide(longMockContactsData, longMockContactsData.length - 1);

    // Click next to wrap around
    await clickNext();

    expectSlide(longMockContactsData, 0);
  });

  it('wraps around to the last contact from the first', async () => {
    const longMockContactsData = [
      { url: 'https://example.com/test1', description: 'Test Description 1' },
      { url: 'https://example.com/test2', description: 'Test Description 2' },
      { url: 'https://example.com/test3', description: 'Test Description 3' },
    ];
    await renderWithContacts(longMockContactsData);
    expectSlide(longMockContactsData, 0);

    await clickPrevious();

    expectSlide(longMockContactsData, longMockContactsData.length - 1);
  });
  describe('QR contents popup', () => {
    const TWO = [
      { url: 'https://example.com/one', description: 'Test Description 1' },
      { url: 'https://example.com/two', description: 'Test Description 2' },
    ];

    // Real browsers populate touches, changedTouches, and screen coordinates on
    // every touch event; the carousel's swipe handler reads changedTouches.
    const touch = (x, y) => [{ clientX: x, clientY: y, screenX: x, screenY: y }];
    const touchEvent = (x, y) => ({ touches: touch(x, y), changedTouches: touch(x, y) });

    const longPress = async (element) => {
      fireEvent.touchStart(element, touchEvent(10, 10));
      await act(async () => {
        jest.advanceTimersByTime(600);
      });
      fireEvent.touchEnd(element, touchEvent(10, 10));
    };

    beforeEach(() => {
      jest.useFakeTimers({ advanceTimers: true });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('does not show the popup until the user asks for it', async () => {
      await renderWithContacts(TWO);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('shows the current slide url when the qr code is clicked', async () => {
      await renderWithContacts(TWO);

      fireEvent.click(screen.getByAltText('QR Code'));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('https://example.com/one')).toBeInTheDocument();
    });

    it('shows the url of the slide the user navigated to', async () => {
      await renderWithContacts(TWO);
      await clickNext();

      fireEvent.click(screen.getByAltText('QR Code'));

      expect(screen.getByText('https://example.com/two')).toBeInTheDocument();
    });

    it('opens the popup on a long press', async () => {
      await renderWithContacts(TWO);

      await longPress(screen.getByAltText('QR Code'));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('does not open the popup on a quick tap', async () => {
      await renderWithContacts(TWO);
      const qr = screen.getByAltText('QR Code');

      fireEvent.touchStart(qr, touchEvent(10, 10));
      await act(async () => {
        jest.advanceTimersByTime(100);
      });
      fireEvent.touchEnd(qr, touchEvent(10, 10));
      fireEvent.click(qr);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('does not open the popup when the press turns into a swipe', async () => {
      await renderWithContacts(TWO);
      const qr = screen.getByAltText('QR Code');

      fireEvent.touchStart(qr, touchEvent(10, 10));
      fireEvent.touchMove(qr, touchEvent(90, 12));
      await act(async () => {
        jest.advanceTimersByTime(600);
      });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('does not cancel the press for a small finger wobble', async () => {
      await renderWithContacts(TWO);
      const qr = screen.getByAltText('QR Code');

      fireEvent.touchStart(qr, touchEvent(10, 10));
      fireEvent.touchMove(qr, touchEvent(13, 12));
      await act(async () => {
        jest.advanceTimersByTime(600);
      });

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('opens on a mouse click once an earlier touch has settled', async () => {
      await renderWithContacts(TWO);
      const qr = screen.getByAltText('QR Code');

      fireEvent.touchStart(qr, touchEvent(10, 10));
      fireEvent.touchEnd(qr, touchEvent(10, 10));
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      fireEvent.click(qr);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('suppresses the browser image menu during a long press', async () => {
      await renderWithContacts(TWO);
      const qr = screen.getByAltText('QR Code');

      fireEvent.touchStart(qr, touchEvent(10, 10));
      // Chrome ignores -webkit-touch-callout and raises contextmenu instead;
      // its menu is browser chrome and would sit above our dialog.
      const notPrevented = fireEvent.contextMenu(qr);

      expect(notPrevented).toBe(false);
    });

    it('leaves the right-click menu alone when there was no touch', async () => {
      await renderWithContacts(TWO);
      const qr = screen.getByAltText('QR Code');

      const notPrevented = fireEvent.contextMenu(qr);

      // Desktop right-click must still offer Save image as.
      expect(notPrevented).toBe(true);
    });

    it('hands the generated image to the popup so it can be saved', async () => {
      await renderWithContacts(TWO);

      fireEvent.click(screen.getByAltText('QR Code'));

      // The QR data URLs arrive from their own effect, so wait for the link
      // rather than assuming it is there the moment the dialog opens.
      const link = await screen.findByRole('link', { name: /save image/i });
      expect(link).toHaveAttribute('href', 'data:image/png;base64,mock-qr-code');
    });

    it('closes the popup when the slide changes', async () => {
      await renderWithContacts(TWO);
      fireEvent.click(screen.getByAltText('QR Code'));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      await clickNext();

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
  it('does not pin the description to a reserved height', async () => {
    await renderWithContacts([
      { url: 'https://example.com/one', description: 'Test Description 1' },
    ]);

    // The description takes whatever space is left over. A reserved min-height
    // would win over that and push the controls off a small screen, which is
    // the whole reason the reservation was removed.
    expect(screen.getByTestId('description').style.minHeight).toBe('');
  });

  it('generates QR codes large enough to survive being scaled up', async () => {
    await renderWithContacts([
      { url: 'https://example.com/one', description: 'Test Description 1' },
    ]);

    // The image is displayed at ~80% of the viewport width, so a 200px raster
    // would be upscaled several times over and lose the crisp module edges a
    // scanner needs.
    const [, options] = QRCode.toDataURL.mock.calls[0];
    expect(options.width).toBeGreaterThanOrEqual(800);
  });

  describe('file actions', () => {
    const ONE = [{ url: 'https://example.com/one', description: 'Test Description 1' }];

    it('shows the file name inside the edit button', async () => {
      await renderWithContacts(ONE, { fileName: 'qrdata.yaml' });

      const edit = screen.getByRole('button', { name: /^Edit qrdata\.yaml$/ });
      expect(edit).toContainElement(screen.getByTestId('file-name'));
      expect(screen.getByTestId('file-name')).toHaveTextContent('qrdata.yaml');
    });

    it('falls back to a plain Edit button when no file name is known', async () => {
      await renderWithContacts(ONE);

      expect(screen.getByRole('button', { name: /^Edit$/ })).toBeInTheDocument();
      expect(screen.queryByTestId('file-name')).not.toBeInTheDocument();
    });

    it('labels the load control Switch', async () => {
      await renderWithContacts(ONE, { fileName: 'qrdata.yaml' });

      expect(screen.getByRole('button', { name: /^Switch$/ })).toBeInTheDocument();
    });

    it('does not show help until it is asked for', async () => {
      await renderWithContacts(ONE, { fileName: 'qrdata.yaml' });

      expect(screen.queryByRole('dialog', { name: /help/i })).not.toBeInTheDocument();
    });

    it('opens help from the actions band', async () => {
      await renderWithContacts(ONE, { fileName: 'qrdata.yaml' });

      fireEvent.click(screen.getByRole('button', { name: /^Help$/ }));

      expect(screen.getByRole('dialog', { name: /help/i })).toBeInTheDocument();
    });

    const openHelp = async () => {
      await renderWithContacts(ONE, { fileName: 'qrdata.yaml' });
      fireEvent.click(screen.getByRole('button', { name: /^Help$/ }));
    };

    // Terms carry a footnote mark, which is not part of the term itself.
    const helpTerms = () =>
      Array.from(document.querySelectorAll('.help dt')).map((dt) =>
        dt.textContent.replace(/[*\u2020]/g, '').trim()
      );

    it('warns in the help that saving drops anything added by hand', async () => {
      await openHelp();

      const help = document.querySelector('.help');
      expect(help).toHaveTextContent(/lines starting with #/i);
      expect(help).toHaveTextContent(/blank lines, and quote marks are all rewritten/i);
    });

    it('names Save As as the safe way to write', async () => {
      await openHelp();

      expect(screen.getByText(/The safe choice/i)).toBeInTheDocument();
    });

    it('states what this browser can do before the rest of the help', async () => {
      await openHelp();

      const note = screen.getByTestId('help-browser');
      const list = document.querySelector('.help');
      // eslint-disable-next-line no-bitwise
      expect(note.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('lists Switch before Edit, and Save As before Save', async () => {
      await openHelp();

      const terms = helpTerms();
      expect(terms.indexOf('Switch')).toBeGreaterThan(-1);
      expect(terms.indexOf('Switch')).toBeLessThan(terms.indexOf('Edit'));
      expect(terms.indexOf('Save As')).toBeLessThan(terms.indexOf('Save'));
    });

    it('closes help on Escape', async () => {
      await renderWithContacts(ONE, { fileName: 'qrdata.yaml' });
      fireEvent.click(screen.getByRole('button', { name: /^Help$/ }));

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByRole('dialog', { name: /help/i })).not.toBeInTheDocument();
    });

    it('shows the running version', async () => {
      await renderWithContacts(ONE, { fileName: 'qrdata.yaml' });

      expect(screen.getByTestId('version-footer')).toBeInTheDocument();
    });

    it('keeps the version footer outside the centred content area', async () => {
      await renderWithContacts(ONE, { fileName: 'qrdata.yaml' });

      const main = document.querySelector('.carousel-main');
      expect(main).not.toContainElement(screen.getByTestId('version-footer'));
    });

    it('keeps the file actions outside the centred content area', async () => {
      await renderWithContacts(ONE, { fileName: 'qrdata.yaml' });

      // The actions occupy their own band at the bottom. Putting them back
      // inside the centred content would make the content centre around them.
      const main = document.querySelector('.carousel-main');
      const actions = document.querySelector('.file-actions');
      expect(main).toContainElement(screen.getByAltText('QR Code'));
      expect(actions).not.toBeNull();
      expect(main).not.toContainElement(actions);
    });
  });
  // A per-entry page colour. The value comes from a user-supplied file and ends
  // up in a style attribute, so an unrecognised one must style nothing at all
  // rather than something broken.
  describe('entry background colour', () => {
    const root = () => document.querySelector('.ContactCarousel');

    const WITH_COLOURS = [
      { url: 'https://example.com/a', description: 'Pale one', background: '#ffe8d6' },
      { url: 'https://example.com/b', description: 'Dark one', background: '#1d3557' },
      { url: 'https://example.com/c', description: 'Plain one' },
    ];

    it('paints the page with the current entry colour', async () => {
      await renderWithContacts(WITH_COLOURS);

      expect(root()).toHaveStyle({ backgroundColor: '#ffe8d6' });
    });

    it('repaints when moving to the next entry', async () => {
      await renderWithContacts(WITH_COLOURS);

      await clickNext();

      expect(root()).toHaveStyle({ backgroundColor: '#1d3557' });
    });

    it('leaves the page alone for an entry with no colour', async () => {
      await renderWithContacts(WITH_COLOURS);
      await clickNext();

      await clickNext();

      expect(root().style.backgroundColor).toBe('');
      expect(root().style.color).toBe('');
    });

    it('styles nothing at all when the colour is not one it understands', async () => {
      await renderWithContacts([
        { url: 'https://example.com/a', description: 'Bad colour', background: 'navy' },
      ]);

      expect(root().style.backgroundColor).toBe('');
      expect(root().style.color).toBe('');
    });

    it('puts dark text on a pale page', async () => {
      await renderWithContacts(WITH_COLOURS);

      expect(root()).toHaveStyle({ color: '#111111' });
    });

    it('puts light text on a dark page', async () => {
      await renderWithContacts(WITH_COLOURS);

      await clickNext();

      expect(root()).toHaveStyle({ color: '#ffffff' });
    });

    // Tinting the quiet zone makes the code blend into a pale page. On a dark
    // page it would leave black modules on near-black, so the code keeps its
    // white plate instead.
    it('tints the QR code to match a pale page', async () => {
      await renderWithContacts(WITH_COLOURS);

      expect(QRCode.toDataURL).toHaveBeenCalledWith(
        'https://example.com/a',
        expect.objectContaining({ color: { light: '#ffe8d6' } })
      );
    });

    it('does not tint the QR code on a dark page', async () => {
      await renderWithContacts(WITH_COLOURS);

      const call = QRCode.toDataURL.mock.calls.find((c) => c[0] === 'https://example.com/b');
      expect(call[1]).not.toHaveProperty('color');
    });

    it('does not tint the QR code for an entry with no colour', async () => {
      await renderWithContacts(WITH_COLOURS);

      const call = QRCode.toDataURL.mock.calls.find((c) => c[0] === 'https://example.com/c');
      expect(call[1]).not.toHaveProperty('color');
    });

    // Dialogs and the footer render inside this element and read their colours
    // from tokens. Without a forced theme they resolve against the phone, so a
    // pale card on a dark phone gets dark-scheme text on a light page - the
    // version footer lands at 2.4:1 that way.
    it('forces the light theme onto the page for a pale colour', async () => {
      await renderWithContacts(WITH_COLOURS);

      expect(root()).toHaveClass('theme-light');
      expect(root()).not.toHaveClass('theme-dark');
    });

    it('forces the dark theme onto the page for a dark colour', async () => {
      await renderWithContacts(WITH_COLOURS);

      await clickNext();

      expect(root()).toHaveClass('theme-dark');
      expect(root()).not.toHaveClass('theme-light');
    });

    it('forces neither when the entry names no colour, so the phone decides', async () => {
      await renderWithContacts(WITH_COLOURS);
      await clickNext();

      await clickNext();

      expect(root()).not.toHaveClass('theme-light');
      expect(root()).not.toHaveClass('theme-dark');
    });

    it('forces neither for a colour it cannot understand', async () => {
      await renderWithContacts([
        { url: 'https://example.com/a', description: 'Bad colour', background: 'navy' },
      ]);

      expect(root()).not.toHaveClass('theme-light');
      expect(root()).not.toHaveClass('theme-dark');
    });

    it('keeps the carousel class whatever theme is forced', async () => {
      await renderWithContacts(WITH_COLOURS);

      expect(root()).toHaveClass('ContactCarousel');
    });

    it('generates every code at the level a centre mark needs', async () => {
      await renderWithContacts(WITH_COLOURS);

      QRCode.toDataURL.mock.calls.forEach((call) => {
        expect(call[1].errorCorrectionLevel).toBe('H');
      });
    });

    it('still generates at the full pixel size when tinting', async () => {
      await renderWithContacts(WITH_COLOURS);

      expect(QRCode.toDataURL).toHaveBeenCalledWith(
        'https://example.com/a',
        expect.objectContaining({ width: 1024 })
      );
    });
  });
  // Paper has no colour scheme and no dark mode. Whatever the screen is doing -
  // a chosen background, the phone's theme - what comes out of a printer has to
  // be a scannable code and readable words.
  describe('printing', () => {
    const TINTED = [
      { url: 'https://example.com/pale', description: 'Pale one', background: '#f2e6c8' },
      { url: 'https://example.com/plain', description: 'Plain one' },
      { url: 'https://example.com/dark', description: 'Dark one', background: '#1d3557' },
    ];

    const callsFor = (url) => QRCode.toDataURL.mock.calls.filter((call) => call[0] === url);

    // The shared mock answers every call with the same string, which would make
    // "the print copy is the plain one" pass even if the two were swapped.
    beforeEach(() => {
      QRCode.toDataURL.mockImplementation((url, options) =>
        Promise.resolve(options && options.color ? 'data:image/png;tinted' : 'data:image/png;plain')
      );
    });

    it('offers a print button', async () => {
      await renderWithContacts(TINTED);

      expect(screen.getByRole('button', { name: /^Print$/i })).toBeInTheDocument();
    });

    it('asks the browser to print', async () => {
      const print = jest.fn();
      window.print = print;
      await renderWithContacts(TINTED);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^Print$/i }));
      });

      expect(print).toHaveBeenCalledTimes(1);
    });

    // The tint is baked into the PNG, so no stylesheet can take it back out.
    // A second, plain code is the only way paper gets black on white.
    it('generates a plain code alongside a tinted one', async () => {
      await renderWithContacts(TINTED);

      const calls = callsFor('https://example.com/pale');
      expect(calls).toHaveLength(2);
      expect(calls.some((call) => call[1].color)).toBe(true);
      expect(calls.some((call) => !call[1].color)).toBe(true);
    });

    // Generating a second identical code for every untinted entry would be pure
    // waste, and every entry is untinted by default.
    it('generates no second code when the first is already plain', async () => {
      await renderWithContacts(TINTED);

      expect(callsFor('https://example.com/plain')).toHaveLength(1);
      expect(callsFor('https://example.com/dark')).toHaveLength(1);
    });

    it('puts the plain code in the document for print to pick up', async () => {
      await renderWithContacts(TINTED);

      const printImage = document.querySelector('.qr-code-print');
      expect(printImage).toBeInTheDocument();
      expect(printImage.getAttribute('src')).toBe('data:image/png;plain');
      // ...while the one on screen keeps the entry's colour.
      expect(document.querySelector('.qr-code').getAttribute('src')).toBe(
        'data:image/png;tinted'
      );
    });

    it('uses the one code there is when the entry has no colour', async () => {
      await renderWithContacts(TINTED);

      await clickNext();

      expect(document.querySelector('.qr-code-print').getAttribute('src')).toBe(
        'data:image/png;plain'
      );
      expect(document.querySelector('.qr-code').getAttribute('src')).toBe('data:image/png;plain');
    });

    it('keeps the print copy out of the accessibility tree', async () => {
      await renderWithContacts(TINTED);

      expect(document.querySelector('.qr-code-print')).toHaveAttribute('aria-hidden', 'true');
    });

    it('follows the entry being viewed', async () => {
      await renderWithContacts(TINTED);

      await clickNext();

      expect(document.querySelector('.qr-code-print')).toBeInTheDocument();
      expect(screen.getByText('Plain one')).toBeInTheDocument();
    });
  });
});
