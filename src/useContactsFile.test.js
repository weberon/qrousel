import yaml from 'js-yaml';
import { readContactsFile, serializeContacts, suggestedFileName } from './useContactsFile';

describe('suggestedFileName', () => {
  const at = (y, m, d, hh, mm, ss) => new Date(y, m - 1, d, hh, mm, ss);

  it('stamps the current file name with the date and time', () => {
    expect(suggestedFileName('contacts.yaml', at(2026, 8, 25, 14, 32, 10))).toBe(
      'contacts-20260825-143210.yaml'
    );
  });

  it('keeps a .yml extension rather than forcing .yaml', () => {
    expect(suggestedFileName('contacts.yml', at(2026, 8, 25, 14, 32, 10))).toBe(
      'contacts-20260825-143210.yml'
    );
  });

  it('falls back to qrdata when no file is loaded', () => {
    expect(suggestedFileName(null, at(2026, 8, 25, 14, 32, 10))).toBe(
      'qrdata-20260825-143210.yaml'
    );
  });

  it('does not stack timestamps when saving a file it already stamped', () => {
    expect(suggestedFileName('qrdata-20260825-143210.yaml', at(2026, 8, 25, 15, 0, 0))).toBe(
      'qrdata-20260825-150000.yaml'
    );
  });

  it('pads single digit months, days, and times', () => {
    expect(suggestedFileName('a.yaml', at(2026, 1, 2, 3, 4, 5))).toBe('a-20260102-030405.yaml');
  });

  it('adds an extension to a name that has none', () => {
    expect(suggestedFileName('contacts', at(2026, 8, 25, 14, 32, 10))).toBe(
      'contacts-20260825-143210.yaml'
    );
  });

  it('does not produce a bare timestamp for a name that is only an extension', () => {
    expect(suggestedFileName('.yaml', at(2026, 8, 25, 14, 32, 10))).toBe(
      'qrdata-20260825-143210.yaml'
    );
  });
});

describe('readContactsFile', () => {
  const ENTRIES = [{ url: 'https://example.com', description: 'One' }];
  const LOGO = 'data:image/png;base64,iVBORw0KGgo=';

  // Every file written before logos existed is a bare list, and must keep
  // working untouched - so the shape itself says which kind of file it is.
  it('reads a bare list as entries with no default', () => {
    expect(readContactsFile(ENTRIES)).toEqual({ entries: ENTRIES, logo: null });
  });

  it('reads a wrapped file as entries plus its default', () => {
    expect(readContactsFile({ logo: LOGO, entries: ENTRIES })).toEqual({
      entries: ENTRIES,
      logo: LOGO,
    });
  });

  it('reads a wrapper that sets no default', () => {
    expect(readContactsFile({ entries: ENTRIES })).toEqual({ entries: ENTRIES, logo: null });
  });

  it.each([[null], [undefined], ['just a string'], [42], [{}], [{ entries: 'nope' }]])(
    'reads %p as nothing at all',
    (value) => {
      expect(readContactsFile(value)).toEqual({ entries: [], logo: null });
    }
  );
});

describe('serializeContacts', () => {
  const ENTRIES = [{ url: 'https://example.com', description: 'One' }];
  const LOGO = 'data:image/png;base64,iVBORw0KGgo=';

  it('writes a bare list when there is no file default', () => {
    expect(yaml.load(serializeContacts(ENTRIES))).toEqual(ENTRIES);
  });

  it('writes the wrapper when there is one', () => {
    expect(yaml.load(serializeContacts(ENTRIES, LOGO))).toEqual({ logo: LOGO, entries: ENTRIES });
  });

  // The shape has to survive the trip, or a default would last exactly one save.
  it('round trips through a read', () => {
    expect(readContactsFile(yaml.load(serializeContacts(ENTRIES, LOGO)))).toEqual({
      entries: ENTRIES,
      logo: LOGO,
    });
    expect(readContactsFile(yaml.load(serializeContacts(ENTRIES)))).toEqual({
      entries: ENTRIES,
      logo: null,
    });
  });

  it('does not invent a wrapper for a logo it cannot use', () => {
    expect(yaml.load(serializeContacts(ENTRIES, 'https://example.com/logo.png'))).toEqual(ENTRIES);
  });
});
