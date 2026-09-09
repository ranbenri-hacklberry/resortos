import React from 'react';
import { APP_NAME } from '../lib/reviewBrand.js';
import { PRIVACY_BODY, PRIVACY_TITLE } from '../lib/reviewTerms.js';
import ReviewShell from './ReviewShell.jsx';

export default function ReviewPrivacy() {
  return (
    <ReviewShell>
      {({ theme }) => (
        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.08em', color: theme.accent, marginBottom: 6 }}>
            {APP_NAME}
          </div>
          <h1 style={{ margin: '0 0 12px', fontSize: '1.25rem', fontWeight: 900 }}>{PRIVACY_TITLE}</h1>
          <div
            style={{
              whiteSpace: 'pre-wrap',
              fontSize: '0.82rem',
              lineHeight: 1.6,
              color: theme.chipInk
            }}
          >
            {PRIVACY_BODY}
          </div>
          <a
            href="#/"
            style={{
              display: 'block',
              marginTop: 18,
              textAlign: 'center',
              color: theme.accent,
              fontWeight: 800,
              textDecoration: 'none'
            }}
          >
            חזרה
          </a>
        </div>
      )}
    </ReviewShell>
  );
}
