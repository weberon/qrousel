import { useState, useEffect, useRef, useCallback } from 'react';
import yaml from 'js-yaml';
import { normalizeLogo } from './logo';
import {
  downloadFile,
  isFileSystemAccessSupported,
  pickFileWithInput,
  readFileText,
} from './fileFallback';

const STORAGE_KEY = 'contactsData';
const FILE_NAME_KEY = 'contactsFileName';
const FILE_LOGO_KEY = 'contactsFileLogo';

export const STORAGE_FULL_MESSAGE =
  'Your entries are saved in the file, but there was not room to remember them in this browser - most likely a logo is too large. They are still here for now; reloading the page would lose them.';

export const CORRUPT_STORAGE_MESSAGE =
  'Saved contact data was invalid and has been cleared. Please select your qrdata.yaml file again.';

const YAML_FILE_TYPE = {
  description: 'YAML Files',
  accept: { 'application/x-yaml': ['.yaml', '.yml'] },
};

// A QR code can carry anything - mailto:, tel:, WIFI:S=...;, a vCard, plain
// text - so the only rule is that an entry actually has a payload.
export function findInvalidEntries(entries) {
  const invalid = [];
  entries.forEach((entry, index) => {
    if (!String(entry.url == null ? '' : entry.url).trim()) {
      invalid.push(index);
    }
  });
  return invalid;
}

// A timestamp this function itself produced, so repeated Save As on the same
// file replaces the stamp instead of stacking another one on the end.
const OWN_TIMESTAMP = /-\d{8}-\d{6}$/;
const YAML_EXTENSION = /^(.*)(\.ya?ml)$/i;

/**
 * A distinct name to offer in the Save As dialog, derived from the file in
 * hand. The app holds a file handle, not a directory handle, so it cannot look
 * at what is already on disk - the timestamp makes a collision unlikely rather
 * than impossible, and the browser still confirms a genuine overwrite.
 */
export function suggestedFileName(currentName, date) {
  const name = String(currentName || '').trim();
  const match = name.match(YAML_EXTENSION);

  let base = match ? match[1] : name;
  const extension = match ? match[2] : '.yaml';

  base = base.replace(OWN_TIMESTAMP, '') || 'qrdata';

  const pad = (value) => String(value).padStart(2, '0');
  const stamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');

  return `${base}-${stamp}${extension}`;
}

/**
 * The two shapes a qrdata file can take, read into one. A bare list is every
 * file written before there was anything to say about a file as a whole; a
 * mapping with an `entries` key is one that also carries a default logo. The
 * shape itself is the signal, so nothing has to be versioned and no existing
 * file has to change.
 */
export function readContactsFile(parsed) {
  if (Array.isArray(parsed)) return { entries: parsed, logo: null };
  if (parsed && Array.isArray(parsed.entries)) {
    return { entries: parsed.entries, logo: normalizeLogo(parsed.logo) };
  }
  return { entries: [], logo: null };
}

export function serializeContacts(entries, fileLogo) {
  // js-yaml already emits `|` block scalars for multiline descriptions.
  // lineWidth: -1 stops long URLs being folded across lines.
  //
  // The wrapper appears only when there is a default worth carrying, so a file
  // that never had one is written back as the plain list it arrived as.
  const logo = normalizeLogo(fileLogo);
  const document = logo ? { logo, entries } : entries;
  return yaml.dump(document, { lineWidth: -1 });
}

async function writeEntries(fileHandle, entries, fileLogo) {
  const writable = await fileHandle.createWritable();
  await writable.write(serializeContacts(entries, fileLogo));
  await writable.close();
}

/**
 * Owns the contacts that have been *committed* - loaded from a file or
 * successfully saved to one - along with the file handle they came from.
 *
 * There is deliberately no setContacts: nothing can push uncommitted edits into
 * committed state. save(entries) and saveAs(entries) take the entries to write
 * and commit them only after the write succeeds, which is what keeps a denied
 * permission or a failed write from leaving half-saved data behind.
 */
export default function useContactsFile() {
  const [contacts, setContacts] = useState([]);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [canSaveInPlace, setCanSaveInPlace] = useState(false);
  // True while the remembered file was written by someone else, so rewriting it
  // would discard comments and formatting the app cannot reproduce.
  const [isForeignFile, setIsForeignFile] = useState(false);
  // The default mark for every entry in this file that does not name its own.
  // Belongs to the file rather than to any entry, so it is held and persisted
  // apart from them.
  const [fileLogo, setFileLogo] = useState(null);
  // Set when the browser refused to keep a copy. The file itself was still
  // written - what is lost is only surviving a reload, which is worth saying
  // plainly rather than letting the entries quietly vanish later.
  const [storageWarning, setStorageWarning] = useState(null);
  // Held for the session only. A FileSystemFileHandle is not serializable, so
  // after a reload there is no link to the original file and Save As is the
  // only way to write.
  const fileHandleRef = useRef(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      setContacts(JSON.parse(saved));
      setFileLogo(normalizeLogo(localStorage.getItem(FILE_LOGO_KEY)));
      // The name is a plain string and survives a reload; the handle does not,
      // so canSaveInPlace stays false and Save is still not offered. Showing
      // where the data came from is what makes that explainable.
      setFileName(localStorage.getItem(FILE_NAME_KEY));
    } catch (e) {
      setError(CORRUPT_STORAGE_MESSAGE);
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(FILE_NAME_KEY);
      localStorage.removeItem(FILE_LOGO_KEY);
    }
  }, []);

  // The name of the file the data came from, on its own. Without the File
  // System Access API a name is all there is to keep - a file input hands over
  // a copy, and a download reports nothing back - so this is deliberately
  // separable from adopting a handle.
  const adoptName = useCallback((name) => {
    const resolved = name || null;
    setFileName(resolved);
    if (resolved) localStorage.setItem(FILE_NAME_KEY, resolved);
  }, []);

  // Adopting a file is one step, not three: a handle that is remembered while
  // canSaveInPlace still says otherwise is a state the UI cannot report.
  const rememberFile = useCallback(
    (fileHandle, name) => {
      fileHandleRef.current = fileHandle;
      setCanSaveInPlace(true);
      adoptName(name || fileHandle.name);
    },
    [adoptName]
  );

  // Logos are the first thing this app stores that is large enough to run out
  // of room. A refusal here is not a lost save - the file was written - so it
  // must not throw, and it must not be silent either.
  const remember = useCallback((key, value) => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      setStorageWarning(STORAGE_FULL_MESSAGE);
      localStorage.removeItem(key);
      return false;
    }
  }, []);

  const commit = useCallback(
    (entries) => {
      setContacts(entries);
      setStorageWarning(null);
      remember(STORAGE_KEY, JSON.stringify(entries));
    },
    [remember]
  );

  // Adopted alongside the entries it applies to, and cleared when a file sets
  // none - otherwise the previous file's mark would follow you into the next.
  const adoptFileLogo = useCallback(
    (logo) => {
      setFileLogo(logo || null);
      if (logo) remember(FILE_LOGO_KEY, logo);
      else localStorage.removeItem(FILE_LOGO_KEY);
    },
    [remember]
  );

  const load = useCallback(async () => {
    try {
      if (!isFileSystemAccessSupported()) {
        const file = await pickFileWithInput();
        // A dismissed dialog is not a failure: leave every piece of state
        // exactly as it was, including any file already loaded.
        if (!file) return { ok: false, reason: 'cancelled' };

        const { entries, logo } = readContactsFile(yaml.load(await readFileText(file)));
        // Only the name survives. There is no handle to remember, so
        // canSaveInPlace stays false and Save is never offered.
        adoptName(file.name);
        adoptFileLogo(logo);
        commit(entries);
        setError(null);
        return { ok: true };
      }

      const [fileHandle] = await window.showOpenFilePicker({ types: [YAML_FILE_TYPE] });
      const file = await fileHandle.getFile();
      const { entries, logo } = readContactsFile(yaml.load(await file.text()));

      rememberFile(fileHandle, fileHandle.name || file.name);
      setIsForeignFile(true);
      adoptFileLogo(logo);
      commit(entries);
      setError(null);
      return { ok: true };
    } catch (e) {
      console.error('Error loading qrdata.yaml:', e);
      setError(e.message);
      return { ok: false, reason: 'load-failed', message: e.message };
    }
  }, [adoptName, adoptFileLogo, commit, rememberFile]);

  const save = useCallback(
    async (entries, draftLogo = fileLogo) => {
      const invalid = findInvalidEntries(entries);
      if (invalid.length > 0) return { ok: false, reason: 'invalid', invalid };

      const fileHandle = fileHandleRef.current;
      if (!fileHandle) return { ok: false, reason: 'no-handle' };

      try {
        // Read access does not imply write access; the Save click is the user
        // gesture the permission prompt requires.
        let permission = await fileHandle.queryPermission({ mode: 'readwrite' });
        if (permission === 'prompt') {
          permission = await fileHandle.requestPermission({ mode: 'readwrite' });
        }
        if (permission !== 'granted') return { ok: false, reason: 'denied' };

        await writeEntries(fileHandle, entries, draftLogo);
        setIsForeignFile(false);
        adoptFileLogo(normalizeLogo(draftLogo));
        commit(entries);
        return { ok: true };
      } catch (e) {
        console.error('Error saving qrdata.yaml:', e);
        return { ok: false, reason: 'write-failed', message: e.message };
      }
    },
    [adoptFileLogo, commit, fileLogo]
  );

  const saveAs = useCallback(
    async (entries, draftLogo = fileLogo) => {
      const invalid = findInvalidEntries(entries);
      if (invalid.length > 0) return { ok: false, reason: 'invalid', invalid };

      const name = suggestedFileName(fileName, new Date());

      if (!isFileSystemAccessSupported()) {
        // A download is one-way: no handle comes back, and there is no way to
        // learn where it landed or whether the name survived. Reporting it as
        // a plain save would claim more than is known, hence via.
        downloadFile(name, serializeContacts(entries, draftLogo));
        adoptName(name);
        adoptFileLogo(normalizeLogo(draftLogo));
        commit(entries);
        return { ok: true, via: 'download' };
      }

      try {
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: name,
          types: [YAML_FILE_TYPE],
        });
        await writeEntries(fileHandle, entries, draftLogo);

        // Only adopt the new file once the write actually landed.
        rememberFile(fileHandle);
        setIsForeignFile(false);
        adoptFileLogo(normalizeLogo(draftLogo));
        commit(entries);
        return { ok: true };
      } catch (e) {
        if (e.name === 'AbortError') return { ok: false, reason: 'cancelled' };
        console.error('Error saving qrdata.yaml:', e);
        return { ok: false, reason: 'write-failed', message: e.message };
      }
    },
    [adoptName, adoptFileLogo, commit, rememberFile, fileName, fileLogo]
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    contacts,
    error,
    fileName,
    fileLogo,
    storageWarning,
    canSaveInPlace,
    isForeignFile,
    load,
    save,
    saveAs,
    clearError,
  };
}
