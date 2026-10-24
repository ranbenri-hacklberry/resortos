/**
 * Israeli ID & Official Document OCR & Validation Types
 */

export type OfficialDocumentType =
  | 'israeli_id_biometric'
  | 'israeli_id_blue'
  | 'israeli_driver_license'
  | 'passport'
  | 'unrecognized';

export interface RawIDModelOutput {
  is_valid_official_id: boolean;
  document_type: OfficialDocumentType;
  id_number: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  confidence: number;
  rejection_reason: string;
  /** CHLOE_ID_NAME_SUGGEST: gemma4 crop suggestion — never trusted automatically */
  name_suggestion?: import('./idNameSuggest.js').IdNameSuggestion;
}

export interface IsraeliIdValidationResult {
  isValid: boolean;
  paddedId: string;
  checkDigit?: number;
  calculatedCheckDigit?: number;
  error?: string;
}

export interface GuestIDVerificationResult {
  /** Overall verification success: official ID + recognized + valid checksum (if Israeli ID) */
  success: boolean;
  /** Whether the document is an official government-issued ID */
  is_valid_official_id: boolean;
  /** Detected document classification */
  document_type: OfficialDocumentType;
  /** Normalized ID/Passport number without hyphens/spaces */
  id_number: string;
  /** First name in Hebrew/English */
  first_name: string;
  /** Last name in Hebrew/English */
  last_name: string;
  /** Birth date in YYYY-MM-DD format if readable */
  birth_date: string | null;
  /** Model detection confidence (0-1) */
  confidence: number;
  /** Luhn check digit validation result (null for non-Israeli IDs such as passports) */
  is_checksum_valid: boolean | null;
  /** Human or machine-readable rejection code/reason if verification failed */
  rejection_reason: string | null;
  /** End-to-end processing latency in milliseconds */
  latency_ms: number;
  /** Raw textual response from model */
  raw_output?: string;
  /** Grok engine: full system decision (accept / manual_review / reject) */
  scan?: import('./grokIdScan.js').IdScanResult;
  /** CHLOE_ID_NAME_SUGGEST: suggested Hebrew names + confidence flag (unconfirmed, informational only) */
  name_suggestion?: import('./idNameSuggest.js').IdNameSuggestion;
}

export interface IDOcrServiceOptions {
  endpointUrl?: string;
  modelName?: string;
  apiKey?: string;
  timeoutMs?: number;
  engine?: 'apple-vision' | 'qwen' | 'auto' | 'grok';
  /** Booking guest name for name matching (grok engine) */
  bookingGuestName?: string;
}

