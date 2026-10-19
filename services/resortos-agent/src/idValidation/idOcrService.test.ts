import { describe, it, expect, vi } from 'vitest';
import {
  extractJsonFromModelResponse,
  processGuestIDDocument,
  toDataUrl,
} from './idOcrService.js';
import type { RawIDModelOutput } from './types.js';

describe('ID OCR Service (processGuestIDDocument)', () => {
  it('toDataUrl formats raw base64 or preserves existing data URI', () => {
    expect(toDataUrl('abc123', 'image/png')).toBe('data:image/png;base64,abc123');
    expect(toDataUrl('data:image/jpeg;base64,xyz')).toBe('data:image/jpeg;base64,xyz');
  });

  it('extractJsonFromModelResponse handles markdown fences and surrounding commentary', () => {
    const rawWithFences = `Here is the extracted document:
\`\`\`json
{
  "is_valid_official_id": true,
  "document_type": "israeli_id_biometric",
  "id_number": "012345674",
  "first_name": "ישראל",
  "last_name": "ישראלי",
  "birth_date": "1990-05-15",
  "confidence": 0.98,
  "rejection_reason": ""
}
\`\`\`
Hope this helps!`;

    const parsed = extractJsonFromModelResponse<RawIDModelOutput>(rawWithFences);
    expect(parsed.is_valid_official_id).toBe(true);
    expect(parsed.id_number).toBe('012345674');
    expect(parsed.first_name).toBe('ישראל');
  });

  it('verifies a valid Israeli biometric ID with authentic checksum', async () => {
    const mockModelOutput: RawIDModelOutput = {
      is_valid_official_id: true,
      document_type: 'israeli_id_biometric',
      id_number: '012345674',
      first_name: 'דניאל',
      last_name: 'כהן',
      birth_date: '1988-12-04',
      confidence: 0.99,
      rejection_reason: '',
    };

    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(mockModelOutput) } }],
      }),
    })) as unknown as typeof fetch;

    const res = await processGuestIDDocument(
      { imageBase64: 'fake-base64-bytes', fetchImpl: mockFetch },
      { endpointUrl: 'http://localhost:11434/v1' }
    );

    expect(res.success).toBe(true);
    expect(res.is_valid_official_id).toBe(true);
    expect(res.document_type).toBe('israeli_id_biometric');
    expect(res.id_number).toBe('012345674');
    expect(res.first_name).toBe('דניאל');
    expect(res.last_name).toBe('כהן');
    expect(res.birth_date).toBe('1988-12-04');
    expect(res.is_checksum_valid).toBe(true);
    expect(res.rejection_reason).toBeNull();
    expect(res.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it('rejects an Israeli ID with an invalid Luhn check digit', async () => {
    const mockModelOutput: RawIDModelOutput = {
      is_valid_official_id: true,
      document_type: 'israeli_id_blue',
      id_number: '012345675', // Check digit 5 is invalid (should be 4)
      first_name: 'יוסי',
      last_name: 'לוי',
      birth_date: '1975-03-20',
      confidence: 0.95,
      rejection_reason: '',
    };

    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(mockModelOutput) } }],
      }),
    })) as unknown as typeof fetch;

    const res = await processGuestIDDocument({
      imageBase64: 'fake-base64-bytes',
      fetchImpl: mockFetch,
    });

    expect(res.success).toBe(false);
    expect(res.is_valid_official_id).toBe(true);
    expect(res.is_checksum_valid).toBe(false);
    expect(res.rejection_reason).toContain('Invalid check digit');
  });

  it('rejects gym membership / country club cards', async () => {
    const mockModelOutput: RawIDModelOutput = {
      is_valid_official_id: false,
      document_type: 'unrecognized',
      id_number: '',
      first_name: 'רון',
      last_name: 'שחר',
      birth_date: '',
      confidence: 0.92,
      rejection_reason: 'gym_membership_card',
    };

    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(mockModelOutput) } }],
      }),
    })) as unknown as typeof fetch;

    const res = await processGuestIDDocument({
      imageBase64: 'fake-base64-bytes',
      fetchImpl: mockFetch,
    });

    expect(res.success).toBe(false);
    expect(res.is_valid_official_id).toBe(false);
    expect(res.document_type).toBe('unrecognized');
    expect(res.is_checksum_valid).toBeNull();
    expect(res.rejection_reason).toBe('gym_membership_card');
  });

  it('rejects credit / debit cards', async () => {
    const mockModelOutput: RawIDModelOutput = {
      is_valid_official_id: false,
      document_type: 'unrecognized',
      id_number: '4580123456789012',
      first_name: 'MAX',
      last_name: 'CARD',
      birth_date: '',
      confidence: 0.97,
      rejection_reason: 'credit_card',
    };

    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(mockModelOutput) } }],
      }),
    })) as unknown as typeof fetch;

    const res = await processGuestIDDocument({
      imageBase64: 'fake-base64-bytes',
      fetchImpl: mockFetch,
    });

    expect(res.success).toBe(false);
    expect(res.is_valid_official_id).toBe(false);
    expect(res.rejection_reason).toBe('credit_card');
  });

  it('accepts official international passport without applying Israeli Luhn checksum', async () => {
    const mockModelOutput: RawIDModelOutput = {
      is_valid_official_id: true,
      document_type: 'passport',
      id_number: 'N1234567A',
      first_name: 'JOHN',
      last_name: 'SMITH',
      birth_date: '1985-07-22',
      confidence: 0.96,
      rejection_reason: '',
    };

    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(mockModelOutput) } }],
      }),
    })) as unknown as typeof fetch;

    const res = await processGuestIDDocument({
      imageBase64: 'fake-base64-bytes',
      fetchImpl: mockFetch,
    });

    expect(res.success).toBe(true);
    expect(res.is_valid_official_id).toBe(true);
    expect(res.document_type).toBe('passport');
    expect(res.id_number).toBe('N1234567A');
    expect(res.first_name).toBe('JOHN');
    expect(res.last_name).toBe('SMITH');
    expect(res.is_checksum_valid).toBeNull();
    expect(res.rejection_reason).toBeNull();
  });

  it('handles server network failure gracefully', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      text: async () => 'Model overloaded',
    })) as unknown as typeof fetch;

    const res = await processGuestIDDocument({
      imageBase64: 'fake-base64-bytes',
      fetchImpl: mockFetch,
    });

    expect(res.success).toBe(false);
    expect(res.is_valid_official_id).toBe(false);
    expect(res.rejection_reason).toContain('OCR endpoint HTTP 503');
  });
});
