import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { readFileSync } from 'node:fs';
import i18n from '../i18n.js';
import GuestWhatsAppFab from '../components/GuestWhatsAppFab.jsx';
import { CHLOE_WA_URL } from './checkoutReminder.js';
import {
  GUEST_WA_FAB_EDGE,
  guestWhatsAppFabVisible,
  isCardcomRedirectSearch
} from './guestWhatsAppFab.js';

describe('guestWhatsAppFabVisible', () => {
  it('shows on pre-check-in surfaces', () => {
    for (const surface of ['loading', 'error', 'form', 'pre']) {
      expect(guestWhatsAppFabVisible({ surface })).toBe(true);
    }
  });

  it('hides inside the Cardcom iframe and the receipt redirect', () => {
    expect(guestWhatsAppFabVisible({ surface: 'form', cardcom: true })).toBe(false);
    expect(guestWhatsAppFabVisible({ surface: 'pre', cardcom: true })).toBe(false);
    expect(guestWhatsAppFabVisible({ surface: 'error', redirecting: true })).toBe(false);
    expect(isCardcomRedirectSearch('?CCode=0&Id=1&Order=tok_a')).toBe(true);
    expect(isCardcomRedirectSearch('?hyp=ok&CCode=0&Id=1')).toBe(false);
    expect(isCardcomRedirectSearch('?CCode=0')).toBe(false);
    expect(isCardcomRedirectSearch('')).toBe(false);
  });

  it('hides on the in-stay portal', () => {
    expect(guestWhatsAppFabVisible({ surface: 'portal' })).toBe(false);
    expect(guestWhatsAppFabVisible({ surface: 'stay' })).toBe(false);
    expect(guestWhatsAppFabVisible({ surface: 'post' })).toBe(false);
  });

  it('anchors on the inline-start corner, away from the primary pay button', () => {
    expect(GUEST_WA_FAB_EDGE).toBe('inline-start');
    const css = readFileSync(new URL('../guest.css', import.meta.url), 'utf8');
    const rule = css.slice(css.indexOf('.guest-wa-fab {'), css.indexOf('.guest-wa-fab {') + 600);
    expect(rule).toContain('position: fixed');
    expect(rule).toContain('inset-inline-start:');
    expect(rule).not.toContain('inset-inline-end');
    const pad = css.slice(css.indexOf('.guest-precheck'), css.indexOf('.guest-precheck') + 240);
    expect(pad).toContain('padding-bottom');
  });
});

describe('GuestWhatsAppFab copy', () => {
  it('localizes the label and tooltip in Hebrew, English, Arabic, and Russian', async () => {
    const labels = [];
    const tips = [];
    for (const lang of ['he', 'en', 'ar', 'ru']) {
      await i18n.changeLanguage(lang);
      const t = i18n.getFixedT(lang);
      const label = t('GUEST_WA_FAB_LABEL');
      const tip = t('GUEST_WA_FAB_TIP');
      expect(label).not.toBe('GUEST_WA_FAB_LABEL');
      expect(tip).not.toBe('GUEST_WA_FAB_TIP');
      labels.push(label);
      tips.push(tip);
    }
    expect(new Set(labels).size).toBe(4);
    expect(new Set(tips).size).toBe(4);
  });

  it('links to the shared Chloe WhatsApp URL', async () => {
    await i18n.changeLanguage('en');
    const html = renderToStaticMarkup(
      React.createElement(I18nextProvider, { i18n }, React.createElement(GuestWhatsAppFab))
    );
    expect(html).toContain(`href="${CHLOE_WA_URL}"`);
    expect(html).toContain('aria-label="Message us on WhatsApp"');
    expect(html).toContain('title="A question about your stay? Message us"');
    expect(html).toContain('class="guest-wa-fab"');
  });
});
