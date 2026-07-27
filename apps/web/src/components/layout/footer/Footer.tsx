'use client';

import React from 'react';

export function Footer() {
  return (
    <footer className="app-footer">
      <div className="footer-content">
        <div className="footer-left">
          <span className="copyright-text">
            © {new Date().getFullYear()} <strong>48 Studios</strong>. All rights reserved.
          </span>
          <span className="footer-separator">•</span>
          <span className="env-badge">Internal Operations Engine</span>
        </div>
        <div className="footer-right">
          <span className="version-tag">v0.1.0-beta.4</span>
          <span className="footer-separator">•</span>
          <span className="build-info">Commit #a8f4c21</span>
        </div>
      </div>
    </footer>
  );
}
