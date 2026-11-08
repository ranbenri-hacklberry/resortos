import React from 'react';
import { useTranslation } from 'react-i18next';
import { CHLOE_WA_URL } from '../lib/checkoutReminder.js';

export default function GuestWhatsAppFab() {
  const { t } = useTranslation();
  const label = t('GUEST_WA_FAB_LABEL');
  const tip = t('GUEST_WA_FAB_TIP');
  return (
    <a
      className="guest-wa-fab"
      href={CHLOE_WA_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={tip}
    >
      <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
        <path
          fill="currentColor"
          d="M20.5 3.5A11 11 0 0 0 2.1 17.8L1 23l5.3-1.1A11 11 0 0 0 20.5 3.5zM12 20.4a9.1 9.1 0 0 1-4.6-1.3l-.3-.2-3.2.8.8-3.1-.2-.3A9.1 9.1 0 1 1 12 20.4zm5-6.8c-.3-.1-1.6-.8-1.8-.9s-.4-.1-.6.1-.7.9-.8 1-.3.2-.6.1a7.4 7.4 0 0 1-2.2-1.4 8.2 8.2 0 0 1-1.5-1.9c-.2-.3 0-.4.1-.6l.4-.4.2-.3a.5.5 0 0 0 0-.5c-.1-.1-.6-1.4-.8-1.9s-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.8 11.8 0 0 0 4.6 4 15 15 0 0 0 1.5.5 3.6 3.6 0 0 0 1.7.1 2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.6-.3z"
        />
      </svg>
      <span className="guest-wa-fab__tip" aria-hidden="true">{tip}</span>
    </a>
  );
}
