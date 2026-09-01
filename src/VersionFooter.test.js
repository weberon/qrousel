import React from 'react';
import { render, screen } from '@testing-library/react';
import VersionFooter from './VersionFooter';

describe('VersionFooter', () => {
  const original = { ...process.env };

  afterEach(() => {
    // Assigning undefined to process.env stores the string "undefined", which
    // leaks into the next test and reads as a real value.
    ['REACT_APP_VERSION', 'REACT_APP_BUILD_TIME', 'REACT_APP_COMMIT'].forEach((key) => {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    });
  });

  it('carries the copyright', () => {
    render(<VersionFooter />);

    expect(screen.getByTestId('copyright')).toHaveTextContent(
      /QRousel .* 2025 reachpersona\.com/
    );
  });

  // Above the build line, which is the technical footnote of the two.
  it('puts the copyright above the version', () => {
    render(<VersionFooter />);

    const copyright = screen.getByTestId('copyright');
    const version = screen.getByTestId('version-footer');
    // eslint-disable-next-line no-bitwise
    expect(copyright.compareDocumentPosition(version) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
  });

  // The version degrades to "dev" when nothing was injected; the copyright is
  // not conditional on anything.
  it('shows the copyright even when no build information exists', () => {
    delete process.env.REACT_APP_VERSION;
    delete process.env.REACT_APP_COMMIT;
    delete process.env.REACT_APP_BUILD_TIME;

    render(<VersionFooter />);

    expect(screen.getByTestId('copyright')).toBeInTheDocument();
  });

  it('shows the version the app was built with', () => {
    process.env.REACT_APP_VERSION = '1.2.3';
    delete process.env.REACT_APP_BUILD_TIME;

    render(<VersionFooter />);

    expect(screen.getByTestId('version-footer')).toHaveTextContent('v1.2.3');
  });

  it('shows the build time alongside the version when it is known', () => {
    process.env.REACT_APP_VERSION = '1.2.3';
    process.env.REACT_APP_BUILD_TIME = '2026-08-25T14:32Z';

    render(<VersionFooter />);

    expect(screen.getByTestId('version-footer')).toHaveTextContent('2026-08-25T14:32Z');
  });

  it('shows no build time when it was not recorded', () => {
    process.env.REACT_APP_VERSION = '1.2.3';
    delete process.env.REACT_APP_BUILD_TIME;

    render(<VersionFooter />);

    expect(screen.getByTestId('version-footer')).toHaveTextContent('v1.2.3');
    expect(screen.getByTestId('version-footer').textContent).not.toMatch(/·|undefined/);
  });

  it('says dev rather than undefined when no version was injected', () => {
    delete process.env.REACT_APP_VERSION;
    delete process.env.REACT_APP_BUILD_TIME;

    render(<VersionFooter />);

    expect(screen.getByTestId('version-footer')).toHaveTextContent('vdev');
  });
  it('pins the build to the commit it was made from', () => {
    process.env.REACT_APP_VERSION = '1.2.3';
    process.env.REACT_APP_COMMIT = '7c0ddd9';
    delete process.env.REACT_APP_BUILD_TIME;

    render(<VersionFooter />);

    expect(screen.getByTestId('version-footer')).toHaveTextContent('v1.2.3+7c0ddd9');
  });

  it('shows no commit marker when the commit is unknown', () => {
    process.env.REACT_APP_VERSION = '1.2.3';
    delete process.env.REACT_APP_COMMIT;
    delete process.env.REACT_APP_BUILD_TIME;

    render(<VersionFooter />);

    const text = screen.getByTestId('version-footer').textContent;
    expect(text).toBe('v1.2.3');
    expect(text).not.toMatch(/\+|undefined/);
  });
});
