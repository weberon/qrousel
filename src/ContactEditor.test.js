import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ContactEditor, { moveEntryAt } from './ContactEditor';
import { BACKGROUND_PRESETS } from './background';

describe('moveEntryAt', () => {
  const entries = [{ url: 'a' }, { url: 'b' }, { url: 'c' }];

  it('swaps an entry with the one after it', () => {
    expect(moveEntryAt(entries, 0, 1)).toEqual([{ url: 'b' }, { url: 'a' }, { url: 'c' }]);
  });

  it('swaps an entry with the one before it', () => {
    expect(moveEntryAt(entries, 2, -1)).toEqual([{ url: 'a' }, { url: 'c' }, { url: 'b' }]);
  });

  it('does not reorder when moving the first entry up', () => {
    expect(moveEntryAt(entries, 0, -1)).toEqual(entries);
  });

  it('does not reorder when moving the last entry down', () => {
    expect(moveEntryAt(entries, 2, 1)).toEqual(entries);
  });

  it('does not mutate the entries it was given', () => {
    const original = [{ url: 'a' }, { url: 'b' }];
    moveEntryAt(original, 0, 1);
    expect(original).toEqual([{ url: 'a' }, { url: 'b' }]);
  });
});

describe('ContactEditor', () => {
  const ENTRIES = [
    { url: 'https://example.com/one', description: 'One' },
    { url: 'tel:+15551234567', description: 'Two' },
  ];

  const show = (props = {}) => {
    const onChange = jest.fn();
    render(
      <ContactEditor
        entries={ENTRIES}
        invalid={[]}
        status={null}
        canSaveInPlace={false}
        saveDisabledReason="no handle"
        onChange={onChange}
        onSave={() => {}}
        onSaveAs={() => {}}
        onDone={() => {}}
        {...props}
      />
    );
    return onChange;
  };

  const helpButtons = () => screen.getAllByRole('button', { name: /what can go in entry/i });

  describe('help for the contents field', () => {
    it('does not show the help until it is asked for', () => {
      show();

      expect(screen.queryByRole('dialog', { name: /what a code can hold/i })).not.toBeInTheDocument();
    });

    it('offers help beside every entry', () => {
      show();

      expect(helpButtons()).toHaveLength(ENTRIES.length);
    });

    it('opens the help from the question mark', () => {
      show();

      fireEvent.click(helpButtons()[0]);

      expect(screen.getByRole('dialog', { name: /what a code can hold/i })).toBeInTheDocument();
    });

    it('opens the same help from a later entry', () => {
      show();

      fireEvent.click(helpButtons()[1]);

      expect(screen.getByRole('dialog', { name: /what a code can hold/i })).toBeInTheDocument();
    });

    // The question mark sits inside a list of inputs. Reading the help must not
    // count as an edit, or it would arm the unsaved-changes guard.
    it('does not change the entries when the help is opened', () => {
      const onChange = show();

      fireEvent.click(helpButtons()[0]);

      expect(onChange).not.toHaveBeenCalled();
    });

    it('closes the help again', () => {
      show();
      fireEvent.click(helpButtons()[0]);

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByRole('dialog', { name: /what a code can hold/i })).not.toBeInTheDocument();
    });
  });

  it('still labels the contents input for each entry', () => {
    show();

    expect(screen.getByLabelText('QR contents for entry 1')).toHaveValue(
      'https://example.com/one'
    );
    expect(screen.getByLabelText('QR contents for entry 2')).toHaveValue('tel:+15551234567');
  });
  describe('logos', () => {
    const PNG = 'data:image/png;base64,iVBORw0KGgo=';
    const OTHER = 'data:image/png;base64,b3RoZXI=';
    const PLAIN = { url: 'https://example.com', description: 'One' };

    const showLogos = (entry, props = {}) => {
      const onChange = jest.fn();
      const onFileLogoChange = jest.fn();
      render(
        <ContactEditor
          entries={[entry]}
          fileLogo={null}
          invalid={[]}
          status={null}
          canSaveInPlace={false}
          saveDisabledReason="no handle"
          onChange={onChange}
          onFileLogoChange={onFileLogoChange}
          onSave={() => {}}
          onSaveAs={() => {}}
          onDone={() => {}}
          {...props}
        />
      );
      return { onChange, onFileLogoChange };
    };

    const entryOut = (onChange) => onChange.mock.calls[0][0][0];

    describe('per entry', () => {
      it('says where its mark is coming from when it sets none', () => {
        showLogos(PLAIN);

        expect(screen.getByTestId('logo-source-1')).toHaveTextContent(/QRousel/i);
      });

      it('says when it is inheriting the file default', () => {
        showLogos(PLAIN, { fileLogo: PNG });

        expect(screen.getByTestId('logo-source-1')).toHaveTextContent(/this file/i);
      });

      it('says when it has one of its own', () => {
        showLogos({ ...PLAIN, logo: OTHER });

        expect(screen.getByTestId('logo-source-1')).toHaveTextContent(/its own/i);
      });

      it('says when it has opted out', () => {
        showLogos({ ...PLAIN, logo: 'none' });

        expect(screen.getByTestId('logo-source-1')).toHaveTextContent(/no mark/i);
      });

      it('shows what will actually be drawn', () => {
        showLogos({ ...PLAIN, logo: OTHER });

        expect(screen.getByTestId('logo-preview-1')).toHaveAttribute('src', OTHER);
      });

      it('shows no preview for an entry that opted out', () => {
        showLogos({ ...PLAIN, logo: 'none' });

        expect(screen.queryByTestId('logo-preview-1')).not.toBeInTheDocument();
      });

      it('can opt the entry out', () => {
        const { onChange } = showLogos({ ...PLAIN, logo: OTHER });

        fireEvent.click(screen.getByRole('button', { name: /no mark on this code/i }));

        expect(entryOut(onChange).logo).toBe('none');
      });

      // Back to inheriting, which is a different thing from having none - and
      // without this there would be no way back from either choice.
      it('can hand the entry back to the file default', () => {
        const { onChange } = showLogos({ ...PLAIN, logo: OTHER });

        fireEvent.click(screen.getByRole('button', { name: /use the default/i }));

        expect('logo' in entryOut(onChange)).toBe(false);
      });

      it('leaves the rest of the entry alone', () => {
        const { onChange } = showLogos({ ...PLAIN, logo: OTHER });

        fireEvent.click(screen.getByRole('button', { name: /no mark on this code/i }));

        expect(entryOut(onChange)).toMatchObject({ url: PLAIN.url, description: PLAIN.description });
      });
    });

    describe('for the whole file', () => {
      it('offers a default that applies to every entry', () => {
        showLogos(PLAIN);

        expect(screen.getByTestId('file-logo-source')).toBeInTheDocument();
      });

      it('says when the file has set one', () => {
        showLogos(PLAIN, { fileLogo: PNG });

        expect(screen.getByTestId('file-logo-preview')).toHaveAttribute('src', PNG);
      });

      it('can clear the file default', () => {
        const { onFileLogoChange } = showLogos(PLAIN, { fileLogo: PNG });

        fireEvent.click(screen.getByRole('button', { name: /^Use the QRousel mark$/i }));

        expect(onFileLogoChange).toHaveBeenCalledWith(null);
      });

      // Otherwise a file wanting bare codes would need `none` written on every
      // entry, and adding an entry would silently bring a mark back.
      it('can opt the whole file out', () => {
        const { onFileLogoChange } = showLogos(PLAIN);

        fireEvent.click(screen.getByRole('button', { name: /no marks in this file/i }));

        expect(onFileLogoChange).toHaveBeenCalledWith('none');
      });
    });

    describe('when the browser ran out of room', () => {
      it('says so, and says the file was still written', () => {
        showLogos(PLAIN, { storageWarning: 'no room for that' });

        expect(screen.getByTestId('storage-warning')).toHaveTextContent('no room for that');
      });

      it('says nothing when there is room', () => {
        showLogos(PLAIN);

        expect(screen.queryByTestId('storage-warning')).not.toBeInTheDocument();
      });
    });
  });

  describe('background colour', () => {
    const showOne = (entry) => {
      const onChange = jest.fn();
      render(
        <ContactEditor
          entries={[entry]}
          invalid={[]}
          status={null}
          canSaveInPlace={false}
          saveDisabledReason="no handle"
          onChange={onChange}
          onSave={() => {}}
          onSaveAs={() => {}}
          onDone={() => {}}
        />
      );
      return onChange;
    };

    const PLAIN = { url: 'https://example.com', description: 'One' };
    const firstEntry = (onChange) => onChange.mock.calls[0][0][0];

    it('offers the presets and a way back to none', () => {
      showOne(PLAIN);

      expect(screen.getByRole('button', { name: /^No background$/i })).toBeInTheDocument();
      BACKGROUND_PRESETS.forEach((preset) => {
        expect(screen.getByRole('button', { name: preset.name })).toBeInTheDocument();
      });
    });

    it('sets the colour when a preset is tapped', () => {
      const onChange = showOne(PLAIN);

      fireEvent.click(screen.getByRole('button', { name: BACKGROUND_PRESETS[2].name }));

      expect(firstEntry(onChange).background).toBe(BACKGROUND_PRESETS[2].value);
    });

    it('keeps the rest of the entry when setting a colour', () => {
      const onChange = showOne(PLAIN);

      fireEvent.click(screen.getByRole('button', { name: BACKGROUND_PRESETS[0].name }));

      expect(firstEntry(onChange)).toMatchObject({
        url: 'https://example.com',
        description: 'One',
      });
    });

    it('takes a colour from the picker', () => {
      const onChange = showOne(PLAIN);

      fireEvent.change(screen.getByLabelText(/custom background for entry 1/i), {
        target: { value: '#1d3557' },
      });

      expect(firstEntry(onChange).background).toBe('#1d3557');
    });

    // Removing the key, not blanking it: a background of '' would be a value the
    // file carries around forever and the viewer has to keep rejecting.
    it('removes the key entirely rather than emptying it', () => {
      const onChange = showOne({ ...PLAIN, background: '#ffe8d6' });

      fireEvent.click(screen.getByRole('button', { name: /^No background$/i }));

      expect('background' in firstEntry(onChange)).toBe(false);
    });

    // The swatches are colour squares with no visible text - their names live
    // only in aria-labels. Without this the choice you just made has no name
    // anywhere on screen, and on a light phone the palest presets change so
    // little that a tap looks like it did nothing at all.
    describe('the caption', () => {
      const caption = () => screen.getByTestId('background-name-1');

      it('names the preset that was tapped', () => {
        showOne({ ...PLAIN, background: BACKGROUND_PRESETS[3].value });

        expect(caption()).toHaveTextContent(BACKGROUND_PRESETS[3].name);
      });

      it('says none when there is no colour', () => {
        showOne(PLAIN);

        expect(caption()).toHaveTextContent(/none/i);
      });

      // A picked colour has no name worth inventing, and the code is the thing
      // someone would need in order to write it into the file by hand.
      it('shows the colour itself when it came from the picker', () => {
        showOne({ ...PLAIN, background: '#123456' });

        expect(caption()).toHaveTextContent('#123456');
      });

      it('updates as soon as a swatch is tapped', () => {
        const onChange = showOne(PLAIN);

        fireEvent.click(screen.getByRole('button', { name: BACKGROUND_PRESETS[4].name }));

        expect(firstEntry(onChange).background).toBe(BACKGROUND_PRESETS[4].value);
      });

      it('shows how light the colour is', () => {
        showOne({ ...PLAIN, background: '#f2e6c8' });

        expect(caption()).toHaveTextContent(/0\.80/);
      });

      it('has no number to show when there is no colour', () => {
        showOne(PLAIN);

        expect(caption()).not.toHaveTextContent(/luminance/i);
      });

      it('says none for a value the app cannot use', () => {
        showOne({ ...PLAIN, background: 'navy' });

        expect(caption()).toHaveTextContent(/none/i);
      });
    });

    // A colour below the threshold is perfectly usable as a page - it just
    // leaves the code sitting on a white square, which looks like a mistake
    // rather than a choice unless someone says so.
    describe('a colour too dark for the code to blend into', () => {
      const warning = () => screen.queryByTestId('background-warning-1');

      it('says what will happen', () => {
        showOne({ ...PLAIN, background: '#1d3557' });

        expect(warning()).toHaveTextContent(/white square/i);
      });

      it('says nothing for a colour the code can take', () => {
        showOne({ ...PLAIN, background: BACKGROUND_PRESETS[0].value });

        expect(warning()).not.toBeInTheDocument();
      });

      it('says nothing when there is no colour at all', () => {
        showOne(PLAIN);

        expect(warning()).not.toBeInTheDocument();
      });

      // Adjacent greys either side of the threshold: nothing between them for a
      // moved boundary to hide in.
      it('warns on the dark side of the line and not the light side', () => {
        showOne({ ...PLAIN, background: '#bbbbbb' });
        expect(warning()).toBeInTheDocument();

        cleanup();
        showOne({ ...PLAIN, background: '#bcbcbc' });
        expect(warning()).not.toBeInTheDocument();
      });
    });

    it('shows which colour is currently set', () => {
      showOne({ ...PLAIN, background: BACKGROUND_PRESETS[1].value });

      expect(screen.getByRole('button', { name: BACKGROUND_PRESETS[1].name })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      expect(screen.getByRole('button', { name: BACKGROUND_PRESETS[0].name })).toHaveAttribute(
        'aria-pressed',
        'false'
      );
    });

    it('shows none as active when there is no colour', () => {
      showOne(PLAIN);

      expect(screen.getByRole('button', { name: /^No background$/i })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
    });

    describe('a value the app cannot use', () => {
      it('says so rather than silently ignoring it', () => {
        showOne({ ...PLAIN, background: 'navy' });

        expect(screen.getByText(/not a colour/i)).toBeInTheDocument();
        expect(screen.queryByText(/starts a comment/i)).not.toBeInTheDocument();
      });

      // Both messages mention quoting, so matching on that would pass whichever
      // one rendered. The comment explanation is what only the YAML case says.
      it('shows the picker a usable colour when the stored one is not', () => {
        showOne({ ...PLAIN, background: 'navy' });

        expect(screen.getByLabelText(/custom background for entry 1/i)).toHaveValue('#ffffff');
      });

      it('normalises a shorthand colour before handing it to the picker', () => {
        showOne({ ...PLAIN, background: '#ABC' });

        expect(screen.getByLabelText(/custom background for entry 1/i)).toHaveValue('#aabbcc');
      });

      // `background: #1d3557` unquoted is a comment in YAML, so the file parses
      // with the key present and the value gone. Reporting that as "not a
      // colour" would send someone looking at a line that reads perfectly well.
      it('explains the quoting trap when the value vanished into a comment', () => {
        showOne({ ...PLAIN, background: null });

        expect(screen.getByText(/starts a comment/i)).toBeInTheDocument();
        expect(screen.queryByText(/not a colour/i)).not.toBeInTheDocument();
      });

      it('says nothing when the colour is fine', () => {
        showOne({ ...PLAIN, background: '#ffe8d6' });

        expect(screen.queryByText(/not a colour/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/starts a comment/i)).not.toBeInTheDocument();
      });

      it('says nothing when there is no colour at all', () => {
        showOne(PLAIN);

        expect(screen.queryByText(/not a colour/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/starts a comment/i)).not.toBeInTheDocument();
      });
    });
  });
});
