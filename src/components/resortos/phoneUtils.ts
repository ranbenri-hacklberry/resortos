/**
 * Israeli Phone Normalization & Masking Utilities
 * Handles BiDi-safe formatting for WhatsApp/SMS OTP and Admin CRM display.
 */

export function cleanPhoneDigits(phone?: string): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

export function toLocalIsraeliPhone(phone?: string): string {
  if (!phone) return '';
  const digits = cleanPhoneDigits(phone);
  if (digits.startsWith('972')) {
    return '0' + digits.slice(3);
  }
  return digits;
}

export function toIsraeliPhone(phone?: string): string {
  if (!phone) return '';
  const local = toLocalIsraeliPhone(phone);
  
  // 10 digits mobile: 05X-XXX-XXXX
  if (local.length === 10 && local.startsWith('05')) {
    return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`;
  }

  // 9 digits landline: 0X-XXX-XXXX
  if (local.length === 9 && local.startsWith('0')) {
    return `${local.slice(0, 2)}-${local.slice(2, 5)}-${local.slice(5)}`;
  }

  // 10 digits other
  if (local.length === 10 && local.startsWith('0')) {
    return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`;
  }

  return local || phone;
}

export function formatMaskedPhone(phone?: string): string {
  if (!phone) return '05*-***-****';
  const local = toLocalIsraeliPhone(phone);

  if (local.length >= 9) {
    const isMobile = local.startsWith('05');
    const prefixLen = isMobile ? 3 : 2;
    const prefix = local.slice(0, prefixLen);
    const suffix = local.slice(-4);
    return `${prefix}-***-${suffix}`;
  }

  return local;
}
