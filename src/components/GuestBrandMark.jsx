import React from 'react';
import { NorthStarIcon } from './mialees/MialeesBrandAssets';
import { GUEST_BRAND } from '../lib/guestTheme';

export default function GuestBrandMark({ theme = 'light', compact = true }) {
  const dark = theme === 'dark';
  const wine = dark ? GUEST_BRAND.pinkDream : GUEST_BRAND.wine;
  const mocha = dark ? GUEST_BRAND.cloudy : GUEST_BRAND.mocha;

  return (
    <div
      aria-label="Mialees Resort"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        lineHeight: 1,
        userSelect: 'none'
      }}
    >
      <NorthStarIcon className={compact ? 'w-3.5 h-3.5' : 'w-5 h-5'} color={wine} />
      <span
        style={{
          marginTop: 3,
          fontFamily: GUEST_BRAND.fontMark,
          fontSize: compact ? 8 : 11,
          letterSpacing: '0.28em',
          fontWeight: 600,
          color: wine
        }}
      >
        MIALEES
      </span>
      <span
        style={{
          marginTop: 2,
          fontFamily: GUEST_BRAND.fontMark,
          fontSize: compact ? 6 : 7,
          letterSpacing: '0.34em',
          fontWeight: 300,
          color: mocha
        }}
      >
        RESORT
      </span>
    </div>
  );
}
