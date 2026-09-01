import React from 'react';
import { render, screen, act, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import yaml from 'js-yaml';
import QRCode from 'qrcode';
import App from './App';
import { BACKGROUND_PRESETS } from './background';

jest.mock('qrcode', () => ({
  toDataURL: jest.fn(() => Promise.resolve('data:image/png;base64,mock-qr-code')),
}));

if (typeof global.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

const CONTACTS = [
  { url: 'https://example.com/one', description: 'Test Description 1' },
  { url: 'https://example.com/two', description: 'Test Description 2' },
];

describe('App', () => {
  let writes;
  let openPicker;
  let savePicker;

  // A fake file handle that records what was written to it, so tests can assert
  // on the bytes the app produced rather than on whether a mock was called.
  // The browser's requestPermission resolves to 'granted' or 'denied' - never
  // back to 'prompt' - so the fake must not either.
  const makeHandle = (
    name,
    { permission = 'granted', grantOnRequest = true, failWrite = false } = {}
  ) => ({
    name,
    getFile: () => ({ text: () => Promise.resolve(yaml.dump(CONTACTS)) }),
    queryPermission: jest.fn(() => Promise.resolve(permission)),
    requestPermission: jest.fn(() => Promise.resolve(grantOnRequest ? 'granted' : 'denied')),
    createWritable: jest.fn(() => {
      if (failWrite) return Promise.reject(new Error('disk full'));
      return Promise.resolve({
        write: (text) => {
          writes.push({ name, text });
          return Promise.resolve();
        },
        close: () => Promise.resolve(),
      });
    }),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // See ContactCarousel.test.js: CRA's resetMocks strips the factory
    // implementation before every test.
    QRCode.toDataURL.mockResolvedValue('data:image/png;base64,mock-qr-code');
    localStorage.clear();
    writes = [];
    openPicker = jest.fn();
    savePicker = jest.fn();
    window.showOpenFilePicker = openPicker;
    window.showSaveFilePicker = savePicker;
    jest.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    window.confirm.mockRestore();
  });

  const click = async (name) => {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name }));
    });
  };

  const type = async (label, value) => {
    await act(async () => {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    });
  };

  const renderApp = async () => {
    await act(async () => {
      render(<App />);
    });
  };

  // Saving over a file the app did not write asks for confirmation the first
  // time. Tests about save mechanics go through it; the warning has its own
  // tests below.
  const saveInPlace = async () => {
    await click(/^Save$/);
    if (screen.queryByRole('button', { name: /Save anyway/i })) {
      await click(/Save anyway/i);
    }
  };

  const loadFile = async (handle = makeHandle('qrdata.yaml')) => {
    openPicker.mockResolvedValue([handle]);
    await renderApp();
    await click(/Select qrdata\.yaml/i);
    await screen.findByText('Test Description 1');
    return handle;
  };

  describe('loading', () => {
    it('shows the contacts from a selected file', async () => {
      await loadFile();

      expect(screen.getByText('Test Description 1')).toBeInTheDocument();
    });

    it('shows the version before any file has been chosen', async () => {
      await renderApp();

      expect(screen.getByTestId('version-footer')).toBeInTheDocument();
    });

    it('shows the version on the error screen too', async () => {
      localStorage.setItem('contactsData', '{not json');

      await renderApp();

      expect(screen.getByTestId('version-footer')).toBeInTheDocument();
    });

    it('reports a failed load', async () => {
      openPicker.mockRejectedValue(new Error('Failed to load file'));
      await renderApp();

      await click(/Select qrdata\.yaml/i);

      expect(screen.getByText('Error: Failed to load file')).toBeInTheDocument();
    });

    it('does not persist contacts when loading fails', async () => {
      openPicker.mockRejectedValue(new Error('Failed to load file'));
      await renderApp();

      await click(/Select qrdata\.yaml/i);

      expect(localStorage.getItem('contactsData')).toBeNull();
    });

    it('can start a new file from the error screen', async () => {
      // The error screen must not be a dead end: the stored data was just
      // discarded, so starting fresh is the obvious way out.
      localStorage.setItem('contactsData', '{not json');
      await renderApp();

      await click(/Create a new qrdata\.yaml/i);

      expect(screen.getByText('Edit qrdata.yaml')).toBeInTheDocument();
    });

    it('recovers instead of crashing when saved contacts are corrupt', async () => {
      localStorage.setItem('contactsData', '{not json');

      await renderApp();

      expect(screen.getByText(/Saved contact data was invalid/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Select qrdata\.yaml/i })).toBeInTheDocument();
      expect(localStorage.getItem('contactsData')).toBeNull();
    });
  });

  describe('editing', () => {
    it('does not show the editor until asked', async () => {
      await loadFile();

      expect(screen.queryByText('Edit qrdata.yaml')).not.toBeInTheDocument();
    });

    it('opens the editor on the loaded entries', async () => {
      await loadFile();

      await click(/^Edit\b/);

      expect(screen.getByLabelText('QR contents for entry 1')).toHaveValue(
        'https://example.com/one'
      );
    });

    it('can start a new file with nothing loaded', async () => {
      await renderApp();

      await click(/Create a new qrdata\.yaml/i);

      expect(screen.getByText('Edit qrdata.yaml')).toBeInTheDocument();
      expect(screen.getByLabelText('QR contents for entry 1')).toHaveValue('');
    });

    it('adds and deletes entries', async () => {
      await loadFile();
      await click(/^Edit\b/);

      await click(/\+ Add entry/);
      expect(screen.getByLabelText('QR contents for entry 3')).toBeInTheDocument();

      await click(/Delete entry 3/);
      expect(screen.queryByLabelText('QR contents for entry 3')).not.toBeInTheDocument();
    });

    it('reorders entries', async () => {
      await loadFile();
      await click(/^Edit\b/);

      await click(/Move entry 2 up/);

      expect(screen.getByLabelText('QR contents for entry 1')).toHaveValue(
        'https://example.com/two'
      );
    });

    it('does not reorder past the ends of the list', async () => {
      await loadFile();
      await click(/^Edit\b/);

      expect(screen.getByRole('button', { name: /Move entry 1 up/ })).toBeDisabled();
      expect(screen.getByRole('button', { name: /Move entry 2 down/ })).toBeDisabled();
    });

    it('does not change what the viewer shows until the edits are saved', async () => {
      await loadFile();
      await click(/^Edit\b/);
      await type('Description for entry 1', 'Edited but unsaved');

      await click(/^Done$/);

      expect(screen.getByText('Test Description 1')).toBeInTheDocument();
      expect(screen.queryByText('Edited but unsaved')).not.toBeInTheDocument();
    });
  });

  describe('saving', () => {
    it('writes yaml back to the loaded file', async () => {
      await loadFile();
      await click(/^Edit\b/);
      await type('QR contents for entry 1', 'mailto:someone@example.com');

      await saveInPlace();

      expect(writes).toHaveLength(1);
      expect(yaml.load(writes[0].text)).toEqual([
        { url: 'mailto:someone@example.com', description: 'Test Description 1' },
        CONTACTS[1],
      ]);
    });

    it('shows the saved entries in the viewer afterwards', async () => {
      await loadFile();
      await click(/^Edit\b/);
      await type('Description for entry 1', 'Saved description');
      await saveInPlace();

      await click(/^Done$/);

      expect(screen.getByText('Saved description')).toBeInTheDocument();
    });

    it('requests write permission before writing', async () => {
      const handle = await loadFile(makeHandle('qrdata.yaml', { permission: 'prompt' }));
      await click(/^Edit\b/);

      await saveInPlace();

      expect(handle.requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
      expect(writes).toHaveLength(1);
    });

    it('does not write when write permission is refused', async () => {
      await loadFile(
        makeHandle('qrdata.yaml', { permission: 'prompt', grantOnRequest: false })
      );
      await click(/^Edit\b/);
      await type('Description for entry 1', 'Edited');

      await saveInPlace();

      expect(writes).toHaveLength(0);
      expect(screen.getByText(/Permission to write the file was refused/)).toBeInTheDocument();
      // The edits must survive so the user can still Save As.
      expect(screen.getByLabelText('Description for entry 1')).toHaveValue('Edited');
    });

    it('does not persist to localStorage when the write fails', async () => {
      await loadFile(makeHandle('qrdata.yaml', { failWrite: true }));
      const before = localStorage.getItem('contactsData');
      await click(/^Edit\b/);
      await type('Description for entry 1', 'Edited');

      await saveInPlace();

      expect(localStorage.getItem('contactsData')).toBe(before);
      expect(screen.getByText(/Nothing was saved/)).toBeInTheDocument();
    });

    it('does not write an entry with no payload', async () => {
      await loadFile();
      await click(/^Edit\b/);
      await type('QR contents for entry 1', '   ');

      await click(/^Save$/);

      expect(writes).toHaveLength(0);
      expect(screen.getByText(/Every entry needs something to encode/)).toBeInTheDocument();
    });

    it('offers no Save button when there is no remembered file', async () => {
      await renderApp();
      await click(/Create a new qrdata\.yaml/i);

      expect(screen.queryByRole('button', { name: /^Save$/ })).not.toBeInTheDocument();
      expect(screen.getByText(/Save As is the only way to write this file/)).toBeInTheDocument();
      expect(writes).toHaveLength(0);
    });

    it('writes a brand new file through Save As', async () => {
      savePicker.mockResolvedValue(makeHandle('new.yaml'));
      await renderApp();
      await click(/Create a new qrdata\.yaml/i);
      await type('QR contents for entry 1', 'https://example.com/new');

      await click(/Save As/);

      expect(writes).toHaveLength(1);
      expect(yaml.load(writes[0].text)).toEqual([
        { url: 'https://example.com/new', description: '' },
      ]);
    });

    it('does not remember a file when the Save As write fails', async () => {
      savePicker.mockResolvedValue(makeHandle('new.yaml', { failWrite: true }));
      await renderApp();
      await click(/Create a new qrdata\.yaml/i);
      await type('QR contents for entry 1', 'https://example.com/new');

      await click(/Save As/);

      // The handle must not be adopted for a file that was never written.
      expect(screen.queryByRole('button', { name: /^Save$/ })).not.toBeInTheDocument();
      expect(localStorage.getItem('contactsData')).toBeNull();
    });

    it('offers a timestamped name rather than always suggesting qrdata.yaml', async () => {
      savePicker.mockResolvedValue(makeHandle('copy.yaml'));
      await loadFile();
      await click(/^Edit\b/);

      await click(/Save As/);

      const { suggestedName } = savePicker.mock.calls[0][0];
      expect(suggestedName).toMatch(/^qrdata-\d{8}-\d{6}\.yaml$/);
      expect(suggestedName).not.toBe('qrdata.yaml');
    });

    it('offers Save once a file has been written with Save As', async () => {
      savePicker.mockResolvedValue(makeHandle('new.yaml'));
      await renderApp();
      await click(/Create a new qrdata\.yaml/i);
      await type('QR contents for entry 1', 'https://example.com/new');
      await click(/Save As/);

      expect(screen.getByRole('button', { name: /^Save$/ })).toBeInTheDocument();
    });

    it('does not remember a file when Save As is cancelled', async () => {
      const abort = new Error('cancelled');
      abort.name = 'AbortError';
      savePicker.mockRejectedValue(abort);
      await renderApp();
      await click(/Create a new qrdata\.yaml/i);
      await type('QR contents for entry 1', 'https://example.com/new');

      await click(/Save As/);

      expect(writes).toHaveLength(0);
      expect(screen.queryByRole('button', { name: /^Save$/ })).not.toBeInTheDocument();
      // Cancelling is not an error - it must not be reported as a failure.
      expect(screen.queryByText(/Nothing was saved/)).not.toBeInTheDocument();
    });
  });

  describe('unsaved changes', () => {
    it('asks before discarding edits', async () => {
      await loadFile();
      await click(/^Edit\b/);
      await type('Description for entry 1', 'Edited');

      await click(/^Done$/);

      expect(window.confirm).toHaveBeenCalled();
    });

    it('stays in the editor when the discard is declined', async () => {
      window.confirm.mockReturnValue(false);
      await loadFile();
      await click(/^Edit\b/);
      await type('Description for entry 1', 'Edited');

      await click(/^Done$/);

      expect(screen.getByText('Edit qrdata.yaml')).toBeInTheDocument();
      expect(screen.getByLabelText('Description for entry 1')).toHaveValue('Edited');
    });

    it('does not ask when nothing was edited', async () => {
      await loadFile();
      await click(/^Edit\b/);

      await click(/^Done$/);

      expect(window.confirm).not.toHaveBeenCalled();
    });

    it('does not ask after a successful save', async () => {
      await loadFile();
      await click(/^Edit\b/);
      await type('Description for entry 1', 'Edited');
      await saveInPlace();

      await click(/^Done$/);

      expect(window.confirm).not.toHaveBeenCalled();
    });
  });

  // A file may carry a default mark for its entries, which means it is a mapping
  // rather than the bare list every older file is. Both shapes have to work, and
  // a save must not quietly convert one into the other.
  describe('a file with a default logo', () => {
    const LOGO = 'data:image/png;base64,iVBORw0KGgo=';

    const wrappedHandle = (name = 'qrdata.yaml') => ({
      ...makeHandle(name),
      getFile: () => ({
        text: () => Promise.resolve(yaml.dump({ logo: LOGO, entries: CONTACTS })),
      }),
    });

    it('shows the entries inside the wrapper', async () => {
      openPicker.mockResolvedValue([wrappedHandle()]);
      await renderApp();
      await click(/Select qrdata\.yaml/i);

      expect(await screen.findByText('Test Description 1')).toBeInTheDocument();
    });

    it('keeps the wrapper when the file is saved again', async () => {
      openPicker.mockResolvedValue([wrappedHandle()]);
      await renderApp();
      await click(/Select qrdata\.yaml/i);
      await screen.findByText('Test Description 1');
      await click(/^Edit\b/);

      await saveInPlace();

      const written = yaml.load(writes[0].text);
      expect(Array.isArray(written)).toBe(false);
      expect(written.logo).toBe(LOGO);
      expect(written.entries).toHaveLength(CONTACTS.length);
    });

    // The other direction matters just as much: a plain list must not sprout a
    // wrapper it never had.
    it('leaves a file that had no default as a plain list', async () => {
      await loadFile();
      await click(/^Edit\b/);

      await saveInPlace();

      expect(Array.isArray(yaml.load(writes[0].text))).toBe(true);
    });
  });

  describe('entry background colour', () => {
    // Every entry has its own swatch row, so a preset name alone is ambiguous.
    const pickBackgroundFor = async (entry, name) => {
      const group = screen.getByRole('group', { name: `Background for entry ${entry}` });
      await act(async () => {
        fireEvent.click(within(group).getByRole('button', { name }));
      });
    };

    it('writes the chosen colour into the file', async () => {
      await loadFile();
      await click(/^Edit\b/);

      await pickBackgroundFor(1, BACKGROUND_PRESETS[1].name);
      await saveInPlace();

      expect(yaml.load(writes[0].text)[0].background).toBe(BACKGROUND_PRESETS[1].value);
    });

    // A bare #1d3557 after a colon is a comment in YAML, so an unquoted colour
    // would be written out and read back as null - the value would survive
    // exactly one save.
    it('quotes the colour, so it survives being read back', async () => {
      await loadFile();
      await click(/^Edit\b/);

      await pickBackgroundFor(1, BACKGROUND_PRESETS[1].name);
      await saveInPlace();

      expect(writes[0].text).toContain(`background: '${BACKGROUND_PRESETS[1].value}'`);
    });

    it('carries the colour through to the viewer', async () => {
      await loadFile();
      await click(/^Edit\b/);
      await pickBackgroundFor(1, BACKGROUND_PRESETS[1].name);
      await saveInPlace();

      await click(/Done/);

      expect(document.querySelector('.ContactCarousel')).toHaveStyle({
        backgroundColor: BACKGROUND_PRESETS[1].value,
      });
    });

    it('leaves an entry with no colour out of the file entirely', async () => {
      await loadFile();
      await click(/^Edit\b/);

      await saveInPlace();

      expect(writes[0].text).not.toContain('background');
    });
  });

  describe('round trip', () => {
    it('leaves an unmodified file byte-identical in structure', async () => {
      await loadFile();
      await click(/^Edit\b/);

      await saveInPlace();

      await waitFor(() => expect(writes).toHaveLength(1));
      expect(yaml.load(writes[0].text)).toEqual(CONTACTS);
    });
  });
  describe('data saved by an earlier version', () => {
    it('shows the carousel with no file name when only contacts were stored', async () => {
      // Every existing user has contactsData in localStorage from a build that
      // never wrote contactsFileName, so this is the upgrade path, not a
      // hypothetical.
      localStorage.setItem('contactsData', JSON.stringify(CONTACTS));

      await renderApp();
      await screen.findByText('Test Description 1');

      expect(screen.getByRole('button', { name: /^Edit$/ })).toBeInTheDocument();
      expect(screen.queryByTestId('file-name')).not.toBeInTheDocument();
    });
  });

  describe('after a reload', () => {
    // A reload keeps localStorage but loses everything held in memory.
    const reload = async () => {
      cleanup();
      await renderApp();
      await screen.findByText('Test Description 1');
    };

    it('still shows the name of the file the data came from', async () => {
      await loadFile();

      await reload();

      expect(screen.getByTestId('file-name')).toHaveTextContent('qrdata.yaml');
    });

    it('does not offer Save, because the link to the file did not survive', async () => {
      await loadFile();
      await reload();

      await click(/^Edit\b/);

      expect(screen.queryByRole('button', { name: /^Save$/ })).not.toBeInTheDocument();
      expect(screen.getByText(/Save As is the only way to write this file/)).toBeInTheDocument();
    });

    it('forgets the file name when the stored contacts were corrupt', async () => {
      await loadFile();
      expect(localStorage.getItem('contactsFileName')).toBe('qrdata.yaml');
      localStorage.setItem('contactsData', '{not json');

      cleanup();
      await renderApp();

      expect(screen.queryByTestId('file-name')).not.toBeInTheDocument();
      // The name describes data that has just been thrown away, so it must go
      // with it rather than linger and attach itself to whatever loads next.
      expect(localStorage.getItem('contactsFileName')).toBeNull();
    });
  });
  describe('overwrite warning', () => {
    const startEditing = async () => {
      await loadFile();
      await click(/^Edit\b/);
      await type('Description for entry 1', 'Edited');
    };

    it('warns before the first in-place save of a file it did not write', async () => {
      await startEditing();

      await click(/^Save$/);

      expect(screen.getByRole('dialog', { name: /overwrite/i })).toBeInTheDocument();
      expect(screen.getByText(/comments/i)).toBeInTheDocument();
      // The warning must be a question, not a notification after the fact.
      expect(writes).toHaveLength(0);
    });

    it('writes when the overwrite is confirmed', async () => {
      await startEditing();
      await click(/^Save$/);

      await click(/Save anyway/i);

      expect(writes).toHaveLength(1);
      expect(screen.queryByRole('dialog', { name: /overwrite/i })).not.toBeInTheDocument();
    });

    it('does not write in place when Save As is chosen instead', async () => {
      savePicker.mockResolvedValue(makeHandle('copy.yaml'));
      await startEditing();
      await click(/^Save$/);

      await click(/Save As instead/i);

      expect(writes).toHaveLength(1);
      expect(writes[0].name).toBe('copy.yaml');
    });

    it('does not write when the warning is dismissed', async () => {
      await startEditing();
      await click(/^Save$/);

      await click(/^Cancel$/);

      expect(writes).toHaveLength(0);
      // The edits must survive a dismissed warning.
      expect(screen.getByLabelText('Description for entry 1')).toHaveValue('Edited');
    });

    it('warns only once for the same file', async () => {
      await startEditing();
      await click(/^Save$/);
      await click(/Save anyway/i);

      await type('Description for entry 1', 'Edited again');
      await click(/^Save$/);

      expect(screen.queryByRole('dialog', { name: /overwrite/i })).not.toBeInTheDocument();
      expect(writes).toHaveLength(2);
    });

    it('does not warn for a file it wrote itself', async () => {
      savePicker.mockResolvedValue(makeHandle('new.yaml'));
      await renderApp();
      await click(/Create a new qrdata\.yaml/i);
      await type('QR contents for entry 1', 'https://example.com/new');
      await click(/Save As/);

      await type('Description for entry 1', 'Edited');
      await click(/^Save$/);

      expect(screen.queryByRole('dialog', { name: /overwrite/i })).not.toBeInTheDocument();
      expect(writes).toHaveLength(2);
    });
  });
  // Firefox and Safari have neither picker. Everything here drives the real
  // fallback - a file input and a download - rather than a mocked module, so
  // the wiring between App and fileFallback is genuinely exercised.
  describe('without the file system access api', () => {
    let downloads;
    let downloadedBlobs;

    const readBlob = (blob) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blob);
      });

    beforeEach(() => {
      delete window.showOpenFilePicker;
      delete window.showSaveFilePicker;
      downloads = [];
      downloadedBlobs = [];
      URL.createObjectURL = jest.fn((blob) => {
        downloadedBlobs.push(blob);
        return `blob:fake/${downloadedBlobs.length}`;
      });
      URL.revokeObjectURL = jest.fn();
      jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
        downloads.push({ name: this.download, href: this.href });
      });
    });

    afterEach(() => {
      delete URL.createObjectURL;
      delete URL.revokeObjectURL;
    });

    const fileInput = () => document.body.querySelector('input[type="file"]');

    const chooseFile = async (text = yaml.dump(CONTACTS), name = 'qrdata.yaml') => {
      const input = fileInput();
      Object.defineProperty(input, 'files', { value: [new File([text], name)] });
      await act(async () => {
        fireEvent.change(input);
      });
    };

    const loadThroughInput = async (...args) => {
      await renderApp();
      await click(/Select qrdata\.yaml/i);
      await chooseFile(...args);
      await screen.findByText('Test Description 1');
    };

    it('loads a file through a file input instead of failing', async () => {
      await loadThroughInput();

      expect(screen.getByText('Test Description 1')).toBeInTheDocument();
      expect(screen.queryByText(/^Error:/)).not.toBeInTheDocument();
    });

    it('shows where the data came from', async () => {
      await loadThroughInput(yaml.dump(CONTACTS), 'work.yaml');

      expect(screen.getByTestId('file-name')).toHaveTextContent('work.yaml');
    });

    // A file input hands over a copy, not a link to the file on disk, so there
    // is nothing to write back to.
    it('does not offer Save after loading through the input', async () => {
      await loadThroughInput();

      await click(/^Edit\b/);

      expect(screen.queryByRole('button', { name: /^Save$/ })).not.toBeInTheDocument();
      expect(screen.getByText(/cannot write back to a file it opened/i)).toBeInTheDocument();
    });

    it('changes nothing when the file dialog is dismissed', async () => {
      await renderApp();
      await click(/Select qrdata\.yaml/i);

      await act(async () => {
        fileInput().dispatchEvent(new Event('cancel'));
      });

      expect(screen.getByText(/No contacts available/i)).toBeInTheDocument();
      expect(screen.queryByText(/^Error:/)).not.toBeInTheDocument();
      expect(localStorage.getItem('contactsData')).toBeNull();
    });

    it('reports a file it cannot parse', async () => {
      await renderApp();
      await click(/Select qrdata\.yaml/i);
      await chooseFile('- url: [unclosed');

      // The read goes through FileReader, which settles after act() has
      // flushed, so the error arrives a tick later than the change event.
      await waitFor(() => expect(screen.getByText(/^Error:/)).toBeInTheDocument());
      expect(localStorage.getItem('contactsData')).toBeNull();
    });

    it('downloads the entries when Save As has no save dialog', async () => {
      await loadThroughInput();
      await click(/^Edit\b/);
      await type('Description for entry 1', 'Edited');

      await click(/Save As/);

      expect(downloads).toHaveLength(1);
      expect(downloads[0].name).toMatch(/^qrdata-\d{8}-\d{6}\.yaml$/);
      const written = await readBlob(downloadedBlobs[0]);
      expect(yaml.load(written)[0].description).toBe('Edited');
    });

    it('says the entries were downloaded rather than saved', async () => {
      await loadThroughInput();
      await click(/^Edit\b/);

      await click(/Save As/);

      expect(screen.getByRole('status')).toHaveTextContent(/downloads folder/i);
      expect(screen.getByRole('status')).not.toHaveTextContent(/^Saved\.$/);
    });

    it('can create and download a new file with nothing loaded', async () => {
      await renderApp();
      await click(/Create a new qrdata\.yaml/i);
      await type('QR contents for entry 1', 'https://example.com/new');

      await click(/Save As/);

      expect(downloads).toHaveLength(1);
      const written = await readBlob(downloadedBlobs[0]);
      expect(yaml.load(written)).toEqual([{ url: 'https://example.com/new', description: '' }]);
    });

    // Validation still runs first: a download cannot be taken back.
    it('does not download an entry with no payload', async () => {
      await renderApp();
      await click(/Create a new qrdata\.yaml/i);

      await click(/Save As/);

      expect(downloads).toEqual([]);
      expect(URL.createObjectURL).not.toHaveBeenCalled();
      expect(screen.getByRole('status')).toHaveTextContent(/Every entry needs something to encode/);
    });

    // The download name is the only trace of where the entries went, so it
    // becomes the file the session is working on - which is also what keeps the
    // next Save As from suggesting qrdata.yaml all over again.
    it('remembers the name it downloaded under', async () => {
      await loadThroughInput(yaml.dump(CONTACTS), 'work.yaml');
      await click(/^Edit\b/);

      await click(/Save As/);
      await click(/Done/);

      expect(screen.getByTestId('file-name')).toHaveTextContent(
        /^work-\d{8}-\d{6}\.yaml$/
      );
      expect(localStorage.getItem('contactsFileName')).toMatch(/^work-\d{8}-\d{6}\.yaml$/);
    });

    it('shows the downloaded entries in the viewer afterwards', async () => {
      await renderApp();
      await click(/Create a new qrdata\.yaml/i);
      await type('QR contents for entry 1', 'https://example.com/new');
      await type('Description for entry 1', 'Brand new');
      await click(/Save As/);

      await click(/Done/);

      expect(screen.getByText('Brand new')).toBeInTheDocument();
    });
  });
});
