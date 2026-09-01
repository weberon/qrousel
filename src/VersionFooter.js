import React from 'react';
import './VersionFooter.css';

/**
 * The two lines that close every screen: who the app belongs to, and which
 * build of it you are looking at.
 *
 * Identifies the running build. Read at render rather than at module load so a
 * test can set the environment around it, and so a missing value degrades to
 * "dev" instead of printing undefined at the user.
 *
 * The app has no service worker, so a redeploy reaches people on their next
 * load; this footer is how you confirm which build you are actually looking at.
 * The version itself never moves - nothing bumps package.json - so the commit
 * and the build time are what actually identify a build.
 */
function VersionFooter() {
  const version = process.env.REACT_APP_VERSION || 'dev';
  const commit = process.env.REACT_APP_COMMIT;
  const builtAt = process.env.REACT_APP_BUILD_TIME;

  return (
    <footer className="app-footer">
      <p className="app-copyright" data-testid="copyright">
        QRousel &copy; 2025 reachpersona.com
      </p>
      <p className="version-footer" data-testid="version-footer">
        v{version}
        {commit ? `+${commit}` : ''}
        {builtAt ? ` · built ${builtAt}` : ''}
      </p>
    </footer>
  );
}

export default VersionFooter;
