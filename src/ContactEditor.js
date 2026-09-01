import React, { useState } from 'react';
import QrContentsHelp from './QrContentsHelp';
import { NO_LOGO, QROUSEL_LOGO, normalizeLogo } from './logo';
import { readLogoFile, NOT_AN_IMAGE, TOO_LARGE } from './logoImport';
import {
  BACKGROUND_PRESETS,
  backgroundLabel,
  canTintQr,
  normalizeHex,
  relativeLuminance,
} from './background';
import './ContactEditor.css';

// Pure so the end-of-list guard is reachable and testable. The buttons are also
// disabled at the ends, which means a click can never reach this guard through
// the UI - without this being a function of its own, the branch would be
// untestable and its mutation would survive.
export function moveEntryAt(entries, index, offset) {
  const target = index + offset;
  // Moving the first entry up or the last one down is a no-op, not a wrap.
  if (target < 0 || target >= entries.length) return entries;
  const reordered = [...entries];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  return reordered;
}

// Clearing removes the key rather than blanking it. An empty string would be a
// value the file carries around forever and every reader has to keep rejecting;
// an absent key is simply an entry with no background.
export function withBackground(entry, value) {
  if (value) return { ...entry, background: value };
  const { background, ...rest } = entry;
  return rest;
}

/**
 * Why a stored background is not being used, or null if it is fine. Written as
 * a function of the entry rather than the value because the two failures look
 * identical from the value alone: `background: #1d3557` unquoted is a comment
 * in YAML, so the key survives and the colour does not.
 */
// What an entry's mark is, and where it came from - the second half being the
// part a picker cannot show. An entry with no logo key looks identical to one
// inheriting a file default until something says which.
export function logoSource(entry, fileLogo) {
  const own = normalizeLogo(entry && entry.logo);
  if (own === NO_LOGO) return { from: 'none', logo: null };
  if (own) return { from: 'entry', logo: own };

  const shared = normalizeLogo(fileLogo);
  if (shared === NO_LOGO) return { from: 'file-none', logo: null };
  if (shared) return { from: 'file', logo: shared };
  return { from: 'default', logo: QROUSEL_LOGO };
}

const LOGO_SOURCE_LABELS = {
  none: 'no mark on this code',
  entry: 'its own mark',
  file: 'the default for this file',
  'file-none': 'no mark - this file has turned them off',
  default: 'the QRousel mark',
};

const LOGO_PROBLEMS = {
  [NOT_AN_IMAGE]: 'That file is not an image the browser can read.',
  [TOO_LARGE]:
    'That picture is too large to carry inside a qrdata file, even shrunk. Try a simpler mark.',
};
const LOGO_PROBLEM_FALLBACK = 'That picture could not be prepared in this browser.';

export function backgroundProblem(entry) {
  if (!entry || !('background' in entry)) return null;
  const raw = entry.background;
  if (raw === null || raw === undefined || raw === '') {
    return 'quoting';
  }
  return normalizeHex(raw) ? null : 'unrecognised';
}

/**
 * Presentational list editor. Owns no file, storage, or draft state - it
 * receives the entries and reports every change back through onChange.
 */
function ContactEditor({
  entries,
  fileLogo,
  invalid,
  status,
  storageWarning,
  canSaveInPlace,
  saveDisabledReason,
  onChange,
  onFileLogoChange,
  onSave,
  onSaveAs,
  onDone,
}) {
  const [logoProblem, setLogoProblem] = useState(null);

  // A picked file is never stored as picked - readLogoFile draws it down first,
  // and says why when it cannot.
  const pickLogo = async (file, apply) => {
    setLogoProblem(null);
    const result = await readLogoFile(file);
    if (result.ok) apply(result.logo);
    else setLogoProblem(LOGO_PROBLEMS[result.reason] || LOGO_PROBLEM_FALLBACK);
  };
  // Which payloads the viewer will act on is not guessable from an empty text
  // box, and the answer is the same for every entry - so this is one dialog
  // reachable from each row, not one per row.
  const [isContentsHelpOpen, setIsContentsHelpOpen] = useState(false);

  const setLogo = (index, value) => {
    onChange(
      entries.map((entry, i) => {
        if (i !== index) return entry;
        if (value) return { ...entry, logo: value };
        // Removing the key hands the entry back to the file default, which is a
        // different thing from having no mark - hence two separate controls.
        const { logo, ...rest } = entry;
        return rest;
      })
    );
  };

  const updateEntry = (index, field, value) => {
    onChange(entries.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry)));
  };

  const addEntry = () => {
    onChange([...entries, { url: '', description: '' }]);
  };

  const deleteEntry = (index) => {
    onChange(entries.filter((entry, i) => i !== index));
  };

  const moveEntry = (index, offset) => onChange(moveEntryAt(entries, index, offset));

  const setBackground = (index, value) => {
    onChange(entries.map((entry, i) => (i === index ? withBackground(entry, value) : entry)));
  };

  return (
    <div className="ContactEditor">
      <h1 className="editor-title">Edit qrdata.yaml</h1>

      {status && (
        <p role="status" className={`editor-status editor-status-${status.tone}`}>
          {status.message}
        </p>
      )}

      {entries.length === 0 && (
        <p className="editor-empty">No entries yet. Add one to get started.</p>
      )}

      <div className="editor-file-logo">
        <div className="editor-field-head">
          <span className="editor-field-name">Logo for this file</span>
        </div>
        <div className="editor-logo">
          {normalizeLogo(fileLogo) && normalizeLogo(fileLogo) !== NO_LOGO && (
            <img
              className="editor-logo-preview"
              data-testid="file-logo-preview"
              src={normalizeLogo(fileLogo)}
              alt=""
            />
          )}
          <label className="editor-logo-pick">
            <span>Choose&hellip;</span>
            <input
              type="file"
              accept="image/*"
              aria-label="Choose a default logo for this file"
              onChange={(e) =>
                pickLogo(e.target.files && e.target.files[0], (logo) => onFileLogoChange(logo))
              }
            />
          </label>
          <button type="button" onClick={() => onFileLogoChange(NO_LOGO)}>
            No marks in this file
          </button>
          <button type="button" onClick={() => onFileLogoChange(null)}>
            Use the QRousel mark
          </button>
        </div>
        <p className="editor-background-name" data-testid="file-logo-source">
          {normalizeLogo(fileLogo) === NO_LOGO
            ? 'Entries show no mark unless they set one.'
            : normalizeLogo(fileLogo)
              ? 'Entries without a mark of their own show this one.'
              : 'Entries without a mark of their own show the QRousel mark.'}
        </p>
        {logoProblem && (
          <p className="editor-entry-error" data-testid="logo-problem">
            {logoProblem}
          </p>
        )}
      </div>

      {storageWarning && (
        <p className="editor-background-note" role="status" data-testid="storage-warning">
          {storageWarning}
        </p>
      )}

      <ol className="editor-entries">
        {entries.map((entry, index) => (
          <li key={index} className="editor-entry">
            <div className="editor-field">
              {/* The help button cannot live inside the label: clicking a label
                  also focuses its input, so opening the help would drag the
                  keyboard up on a phone. */}
              <div className="editor-field-head">
                <label className="editor-field-name" htmlFor={`qr-contents-${index}`}>
                  QR contents
                </label>
                <button
                  type="button"
                  className="editor-help-button"
                  aria-label={`What can go in entry ${index + 1}`}
                  onClick={() => setIsContentsHelpOpen(true)}
                >
                  ?
                </button>
              </div>
              <input
                id={`qr-contents-${index}`}
                type="text"
                value={entry.url || ''}
                aria-label={`QR contents for entry ${index + 1}`}
                aria-invalid={invalid.includes(index)}
                onChange={(e) => updateEntry(index, 'url', e.target.value)}
              />
            </div>
            {invalid.includes(index) && (
              <p className="editor-entry-error">
                An entry needs something to encode - a URL, or any other QR payload.
              </p>
            )}
            <div className="editor-field">
              <div className="editor-field-head">
                <span className="editor-field-name">Background</span>
              </div>
              <div
                className="editor-swatches"
                role="group"
                aria-label={`Background for entry ${index + 1}`}
              >
                <button
                  type="button"
                  className="editor-swatch editor-swatch-none"
                  aria-label="No background"
                  aria-pressed={!normalizeHex(entry.background)}
                  onClick={() => setBackground(index, null)}
                >
                  None
                </button>
                {BACKGROUND_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    className="editor-swatch"
                    style={{ backgroundColor: preset.value }}
                    aria-label={preset.name}
                    aria-pressed={normalizeHex(entry.background) === preset.value}
                    onClick={() => setBackground(index, preset.value)}
                  />
                ))}
                <label className="editor-swatch editor-swatch-custom">
                  <span>Custom</span>
                  <input
                    type="color"
                    value={normalizeHex(entry.background) || '#ffffff'}
                    aria-label={`Custom background for entry ${index + 1}`}
                    onChange={(e) => setBackground(index, e.target.value)}
                  />
                </label>
              </div>
              <p className="editor-background-name" data-testid={`background-name-${index + 1}`}>
                {backgroundLabel(entry.background)}
                {/* The number is what the threshold is actually about, so it is
                    worth showing rather than leaving someone to nudge a colour
                    until the white square happens to go away. */}
                {relativeLuminance(entry.background) !== null &&
                  ` · luminance ${relativeLuminance(entry.background).toFixed(2)}`}
              </p>
              {normalizeHex(entry.background) && !canTintQr(entry.background) && (
                <p
                  className="editor-background-note"
                  data-testid={`background-warning-${index + 1}`}
                >
                  Dark enough that the code cannot take this colour - it will sit on a white
                  square instead. Lighten it past 0.50 for the code to blend into the page.
                </p>
              )}
              {backgroundProblem(entry) === 'unrecognised' && (
                <p className="editor-entry-error">
                  Not a colour QRousel understands. Pick one above, or write it in the file as
                  a quoted hex code like &lsquo;#1d3557&rsquo;.
                </p>
              )}
              {backgroundProblem(entry) === 'quoting' && (
                <p className="editor-entry-error">
                  This entry has a background in the file, but no colour reached the app. In
                  YAML a # starts a comment, so a hex code has to be quoted:
                  background: &lsquo;#1d3557&rsquo;. Pick a colour above and Save to fix it.
                </p>
              )}
            </div>
            <div className="editor-field">
              <div className="editor-field-head">
                <span className="editor-field-name">Logo</span>
              </div>
              <div className="editor-logo">
                {logoSource(entry, fileLogo).logo && (
                  <img
                    className="editor-logo-preview"
                    data-testid={`logo-preview-${index + 1}`}
                    src={logoSource(entry, fileLogo).logo}
                    alt=""
                  />
                )}
                <label className="editor-logo-pick">
                  <span>Choose&hellip;</span>
                  <input
                    type="file"
                    accept="image/*"
                    aria-label={`Choose a logo for entry ${index + 1}`}
                    onChange={(e) => pickLogo(e.target.files && e.target.files[0], (logo) =>
                      setLogo(index, logo)
                    )}
                  />
                </label>
                <button type="button" onClick={() => setLogo(index, NO_LOGO)}>
                  No mark on this code
                </button>
                <button type="button" onClick={() => setLogo(index, null)}>
                  Use the default
                </button>
              </div>
              {/* An entry with no logo key looks exactly like one inheriting a
                  default, so the preview alone cannot say which. */}
              <p className="editor-background-name" data-testid={`logo-source-${index + 1}`}>
                Showing {LOGO_SOURCE_LABELS[logoSource(entry, fileLogo).from]}
              </p>
            </div>
            <label className="editor-field">
              <span>Description</span>
              <textarea
                rows={3}
                value={entry.description || ''}
                aria-label={`Description for entry ${index + 1}`}
                onChange={(e) => updateEntry(index, 'description', e.target.value)}
              />
            </label>
            <div className="editor-entry-actions">
              <button
                aria-label={`Move entry ${index + 1} up`}
                disabled={index === 0}
                onClick={() => moveEntry(index, -1)}
              >
                &uarr;
              </button>
              <button
                aria-label={`Move entry ${index + 1} down`}
                disabled={index === entries.length - 1}
                onClick={() => moveEntry(index, 1)}
              >
                &darr;
              </button>
              <button aria-label={`Delete entry ${index + 1}`} onClick={() => deleteEntry(index)}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ol>

      <div className="editor-actions">
        <button onClick={addEntry}>+ Add entry</button>
        {canSaveInPlace ? (
          <button onClick={onSave}>Save</button>
        ) : (
          <p className="editor-note">{saveDisabledReason}</p>
        )}
        <button onClick={onSaveAs}>Save As&hellip;</button>
        <button onClick={onDone}>Done</button>
      </div>

      {isContentsHelpOpen && <QrContentsHelp onClose={() => setIsContentsHelpOpen(false)} />}
    </div>
  );
}

export default ContactEditor;
