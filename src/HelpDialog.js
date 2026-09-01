import React from 'react';
import Modal from './Modal';
import { isFileSystemAccessSupported } from './fileFallback';
import './HelpDialog.css';

const NEEDS_FILE_ACCESS = '*';
const WORKS_DIFFERENTLY = '†';

/**
 * Which deployment is being viewed. The app is served from more than one host
 * at the same path, so the host is the part that actually distinguishes them.
 */
export function appAddress(location) {
  if (!location || !location.host) return null;
  return `${location.host}${location.pathname || '/'}`;
}

function Mark({ children }) {
  return <sup className="help-mark">{children}</sup>;
}

function HelpDialog({ onClose }) {
  const address = appAddress(typeof window === 'undefined' ? null : window.location);
  // Two of the entries below behave differently depending on the browser. The
  // reader should not have to work out which case they are in, so the help
  // answers that first and then highlights the footnote that applies to them.
  const canWriteToFiles = isFileSystemAccessSupported();

  const legendClass = (applies) => `help-legend-item${applies ? ' help-legend-applies' : ''}`;

  return (
    <Modal title="Help" onClose={onClose} testId="help-dialog">
      {address && (
        <p className="help-note help-address" data-testid="help-address">
          Installed from <span className="help-address-value">{address}</span>
        </p>
      )}

      <p className="help-note" data-testid="help-browser">
        {canWriteToFiles ? (
          <>
            <strong>You are using Chrome or Edge.</strong> Everything below works, including
            the parts marked <Mark>{NEEDS_FILE_ACCESS}</Mark>.
          </>
        ) : (
          <>
            <strong>You are using Firefox, Safari, or something similar.</strong> Your browser
            will not let this app change a file on your computer, so it sends your changes to
            your downloads instead. The part marked <Mark>{NEEDS_FILE_ACCESS}</Mark> is missing
            for you, and the part marked <Mark>{WORKS_DIFFERENTLY}</Mark> works as described
            below.
          </>
        )}
      </p>

      <dl className="help">
        <dt>See what a code says</dt>
        <dd>
          Click a code to read the text hidden inside it. On a phone, press and hold it
          instead. If the code holds something your phone can act on - a web address, a phone
          number, an email, or a text message - you also get a button to do it. Anything else
          is shown as text you can copy.
        </dd>

        <dt>Move between codes</dt>
        <dd>Use the &lt; and &gt; buttons, or swipe left and right.</dd>

        <dt>Switch</dt>
        <dd>Opens a different file of codes.</dd>

        <dt>Print</dt>
        <dd>
          Puts the code you are looking at, and its words, on one portrait page. Always in
          black and white: the buttons, the page colour and the app&rsquo;s own dark theme are
          all left off, so the code stays sharp and uses no more ink than it needs.
        </dd>

        <dt>Edit</dt>
        <dd>
          The pencil button, which shows the name of the file you are working on. Add, change,
          delete, and reorder your codes. A code can hold anything - a web address, a phone
          number, wifi details, or a plain note. The <strong>?</strong> beside each contents
          box shows what to type for each of those. Each entry can also be given its own
          background colour, which the whole screen takes when that code is showing, and its
          own logo for the middle of the code - or none at all.
        </dd>

        <dt>
          Save As <Mark>{WORKS_DIFFERENTLY}</Mark>
        </dt>
        <dd>
          The safe choice. Writes your codes to a <em>new</em> file and leaves the file you
          opened exactly as it was. The name it suggests ends in today&rsquo;s date and time,
          so saving again never replaces an earlier version by accident.
        </dd>

        <dt>
          Save <Mark>{NEEDS_FILE_ACCESS}</Mark>
        </dt>
        <dd>
          Replaces the file you opened with your changes. All of your codes are kept. Anything
          else you had put in that file by hand is not: notes to yourself (lines starting with
          #), blank lines, and quote marks are all rewritten. The app asks you first, the
          first time.
        </dd>

        <dt>If you reload the page</dt>
        <dd>
          Your codes are still here, but the app no longer knows which file they came from, so
          it cannot put them back into it. Use Save As to write them out again.
        </dd>
      </dl>

      <div className="help-legend">
        <p className={legendClass(canWriteToFiles)} data-testid="legend-chrome">
          <Mark>{NEEDS_FILE_ACCESS}</Mark> Chrome and Edge only. No other browser lets a web
          page change a file on your computer.
        </p>
        <p className={legendClass(!canWriteToFiles)} data-testid="legend-others">
          <Mark>{WORKS_DIFFERENTLY}</Mark> In Firefox, Safari, and other browsers, Save As
          sends the file to your downloads instead of asking you where to put it. To replace
          your original, move the downloaded file over it yourself.
        </p>
      </div>
    </Modal>
  );
}

export default HelpDialog;
