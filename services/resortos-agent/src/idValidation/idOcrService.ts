/**
 * Israeli ID & Official Document OCR Service
 *
 * Interacts with a local Qwen Vision model (OpenAI-compatible or Ollama endpoint),
 * extracts structured guest identity information, filters out non-official cards,
 * and enforces deterministic Luhn Modulo-10 checksum validation on Israeli IDs.
 */

import { validateIsraeliId } from './israeliIdValidator.js';
import { processWithAppleVision } from './appleVisionOcr.js';
import { scanIdWithGrok } from './grokIdScan.js';
import type {
  GuestIDVerificationResult,
  IDOcrServiceOptions,
  OfficialDocumentType,
  RawIDModelOutput,
} from './types.js';


export const ID_OCR_SYSTEM_PROMPT = `You are a specialized Israeli ID and Official Travel Document Verification OCR Engine.
Your task is to inspect an image of an identification document and extract official guest credentials.

Classification Rules:
1. OFFICIAL GOVERNMENT DOCUMENTS (is_valid_official_id: true):
   - "israeli_id_biometric": Israeli Biometric Teudat Zehut (smart card format, laser-engraved photo, Menorah emblem, bilingual Hebrew/English or Hebrew).
   - "israeli_id_blue": Traditional Israeli non-biometric Teudat Zehut (blue cardboard slip/booklet).
   - "israeli_driver_license": Israeli Driving License (credit card plastic format, Ministry of Transport, state emblem).
   - "passport": Official international passport (Israeli "Darkon" or foreign passport).

2. NON-OFFICIAL / REJECTED CARDS (is_valid_official_id: false, document_type: "unrecognized"):
   - Country club / gym membership cards (e.g. Holmes Place, Space, Country Club, etc.)
   - Loyalty / discount cards (e.g. Shufersal, Tav Zahav, Super-Pharm, etc.)
   - Credit cards / debit cards (e.g. Visa, Mastercard, Isracard, Max, Cal, Diners, etc.)
   - Employee badges, student cards, transit cards (Rav-Kav), business cards.
   - Blurry, unreadable, cut off, or counterfeit images.

Fields to extract in JSON:
- "is_valid_official_id": boolean (true ONLY for official government ID / driving license / passport)
- "document_type": "israeli_id_biometric" | "israeli_id_blue" | "israeli_driver_license" | "passport" | "unrecognized"
- "id_number": string (for Israeli IDs: digits only, without hyphens or spaces. For passport: alphanumeric)
- "first_name": string (Hebrew or English as printed on the document)
- "last_name": string (Hebrew or English as printed on the document)
- "birth_date": string (format: "YYYY-MM-DD" if clearly readable, otherwise empty string "")
- "confidence": number (between 0.0 and 1.0)
- "rejection_reason": string (if rejected, one of: "gym_membership_card", "loyalty_club_card", "credit_card", "blurry_image", "missing_edges", "not_an_official_id". If valid, empty string "")

Output MUST be a single raw JSON object matching this schema, with no markdown, no explanation, no backticks.`;

export const ID_OCR_SCHEMA = {
  type: 'object',
  properties: {
    is_valid_official_id: { type: 'boolean' },
    document_type: {
      type: 'string',
      enum: ['israeli_id_biometric', 'israeli_id_blue', 'israeli_driver_license', 'passport', 'unrecognized'],
    },
    id_number: { type: 'string' },
    first_name: { type: 'string' },
    last_name: { type: 'string' },
    birth_date: { type: 'string' },
    confidence: { type: 'number' },
    rejection_reason: { type: 'string' },
  },
  required: ['is_valid_official_id', 'document_type', 'id_number', 'first_name', 'last_name', 'birth_date', 'confidence', 'rejection_reason'],
  additionalProperties: false,
};

/**
 * Clean and safely parse JSON string from model response, handling markdown fences or preamble.
 */
export function extractJsonFromModelResponse<T>(rawText: string): T {
  let cleaned = rawText.trim();

  // Strip markdown code fences (```json ... ``` or ``` ...)
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // Find outermost curly braces
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  return JSON.parse(cleaned) as T;
}

/**
 * Format base64 image into a complete Data URL.
 */
export function toDataUrl(base64OrDataUrl: string, mimeType = 'image/jpeg'): string {
  const trimmed = base64OrDataUrl.trim();
  if (trimmed.startsWith('data:')) {
    return trimmed;
  }
  return `data:${mimeType};base64,${trimmed}`;
}

export interface ProcessIDInput {
  /** Base64 encoded image string (with or without data:image/...;base64, prefix) */
  imageBase64: string;
  /** Image mime type (default: image/jpeg) */
  mimeType?: string;
  /** Custom injected fetch function for testing */
  fetchImpl?: typeof fetch;
}

/**
 * Main service wrapper: processes guest identification document image.
 */
export async function processGuestIDDocument(
  input: ProcessIDInput,
  options: IDOcrServiceOptions = {}
): Promise<GuestIDVerificationResult> {
  const startTime = Date.now();
  const fetchFn = input.fetchImpl || fetch;

  const endpointUrl = (
    options.endpointUrl ||
    process.env.QWEN_OCR_URL ||
    process.env.OLLAMA_URL ||
    'http://localhost:11434/v1'
  ).replace(/\/$/, '');

  const modelName =
    options.modelName ||
    process.env.QWEN_OCR_MODEL ||
    process.env.OLLAMA_MODEL ||
    'Julioa/Qwen3.8-27B-UD-Q3_K_XL:latest';

  const apiKey = options.apiKey || process.env.QWEN_OCR_API_KEY || 'sk-local';
  const timeoutMs = options.timeoutMs || Number(process.env.QWEN_OCR_TIMEOUT_MS) || 60000;

  const dataUrl = toDataUrl(input.imageBase64, input.mimeType || 'image/jpeg');
  const bareBase64 = dataUrl.replace(/^data:[^;]+;base64,/, '');

  let rawOutput = '';
  let parsed: RawIDModelOutput | null = null;
  // Ran 2026-10-24: default engine is Grok vision (strict JSON, system decides). Qwen/Apple remain opt-in.
  const engine = options.engine || (input.fetchImpl ? 'qwen' : 'grok');

  if (engine === 'grok') {
    const r = await scanIdWithGrok(Buffer.from(bareBase64, 'base64'), input.mimeType || 'image/jpeg', { bookingGuestName: options.bookingGuestName });
    const ex = r.extraction;
    const docType: OfficialDocumentType = !ex ? 'unrecognized'
      : ex.document_type === 'not_an_id' || ex.document_type === 'other' ? 'unrecognized' : ex.document_type;
    const id = ex?.id_number || '';
    return {
      success: r.decision === 'accept',
      is_valid_official_id: Boolean(ex && r.checks.is_official),
      document_type: docType,
      id_number: docType.startsWith('israeli_') && id ? id.padStart(9, '0') : id,
      first_name: ex?.first_name || ex?.first_name_en || '',
      last_name: ex?.last_name || ex?.last_name_en || '',
      birth_date: ex?.date_of_birth || null,
      confidence: ex?.confidence ?? 0,
      is_checksum_valid: r.checks.checksum_valid,
      rejection_reason: r.decision === 'accept' ? null : (r.reasons.join(',') || r.error || 'manual_review'),
      latency_ms: Date.now() - startTime,
      scan: r,
    } as GuestIDVerificationResult;
  }

  // 1. Try Apple Silicon Vision OCR first if engine is 'apple-vision' or 'auto'
  if ((engine === 'apple-vision' || engine === 'auto') && !input.fetchImpl) {
    try {
      const appleResult = await processWithAppleVision(input.imageBase64);
      if (appleResult && appleResult.is_valid_official_id && appleResult.id_number) {
        parsed = appleResult;
        rawOutput = JSON.stringify(appleResult, null, 2);
      } else if (engine === 'apple-vision') {
        parsed = appleResult;
        rawOutput = JSON.stringify(appleResult, null, 2);
      }
    } catch (e: any) {
      if (engine === 'apple-vision') {
        const latency_ms = Date.now() - startTime;
        return {
          success: false,
          is_valid_official_id: false,
          document_type: 'unrecognized',
          id_number: '',
          first_name: '',
          last_name: '',
          birth_date: null,
          confidence: 0,
          is_checksum_valid: false,
          rejection_reason: `apple_vision_error: ${e?.message || String(e)}`,
          latency_ms,
        };
      }
    }
  }

  // 2. If not already parsed by Apple Vision, query LLM Vision endpoint
  if (!parsed) {
    try {
      // Send vision request: try OpenAI-compatible endpoint first (/chat/completions)
      const isNativeOllama = endpointUrl.endsWith('/api') || (!endpointUrl.includes('/v1') && endpointUrl.includes(':11434'));
      const targetUrl = isNativeOllama
        ? `${endpointUrl}/chat`
        : (endpointUrl.endsWith('/chat/completions') ? endpointUrl : `${endpointUrl}/chat/completions`);

      const payload = isNativeOllama
        ? {
            model: modelName,
            messages: [
              { role: 'system', content: ID_OCR_SYSTEM_PROMPT },
              {
                role: 'user',
                content: 'Extract and verify the ID document in this image. Return valid JSON only.',
                images: [bareBase64],
              },
            ],
            format: 'json',
            stream: false,
          }
        : {
            model: modelName,
            messages: [
              { role: 'system', content: ID_OCR_SYSTEM_PROMPT },
              {
                role: 'user',
                content: [
                  { type: 'text', text: 'Extract and verify the official ID document in this image. Return strict JSON only.' },
                  { type: 'image_url', image_url: { url: dataUrl } },
                ],
              },
            ],
            temperature: 0.05,
            response_format: { type: 'json_object' },
          };

      const response = await fetchFn(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`OCR endpoint HTTP ${response.status}: ${errText || response.statusText}`);
      }

      const resJson = await response.json() as any;
      rawOutput = isNativeOllama
        ? (resJson.message?.content || '')
        : (resJson.choices?.[0]?.message?.content || '');

      if (!rawOutput) {
        throw new Error('Empty response received from Vision OCR model');
      }

      parsed = extractJsonFromModelResponse<RawIDModelOutput>(rawOutput);
    } catch (err: any) {
      // If LLM failed, and we have Apple Vision on Mac, attempt fallback to Apple Vision
      if (process.platform === 'darwin' && !input.fetchImpl) {
        try {
          const fallback = await processWithAppleVision(input.imageBase64);
          if (fallback) {
            parsed = fallback;
            rawOutput = `[Fallback Apple Vision OCR due to LLM error: ${err?.message}]\n${JSON.stringify(fallback, null, 2)}`;
          }
        } catch {
          // fallback failed, continue to error
        }
      }

      if (!parsed) {
        const latency_ms = Date.now() - startTime;
        return {
          success: false,
          is_valid_official_id: false,
          document_type: 'unrecognized',
          id_number: '',
          first_name: '',
          last_name: '',
          birth_date: null,
          confidence: 0,
          is_checksum_valid: false,
          rejection_reason: `ocr_error: ${err?.message || String(err)}`,
          latency_ms,
          raw_output: rawOutput || undefined,
        };
      }
    }
  }


  const latency_ms = Date.now() - startTime;

  // Normalize document type
  const docType = (parsed.document_type || 'unrecognized') as OfficialDocumentType;
  const isOfficial = Boolean(parsed.is_valid_official_id) && docType !== 'unrecognized';
  const cleanId = String(parsed.id_number || '').trim().replace(/[-\s]/g, '');

  // 3. Official ID rejection check
  if (!isOfficial) {
    return {
      success: false,
      is_valid_official_id: false,
      document_type: docType,
      id_number: cleanId,
      first_name: parsed.first_name || '',
      last_name: parsed.last_name || '',
      birth_date: parsed.birth_date || null,
      confidence: Number(parsed.confidence) || 0,
      is_checksum_valid: null,
      rejection_reason: parsed.rejection_reason || 'non_official_or_unrecognized_document',
      latency_ms,
      raw_output: rawOutput,
      ...(parsed.name_suggestion ? { name_suggestion: parsed.name_suggestion } : {}),
    };
  }

  // 4. Deterministic Checksum Validation for Israeli IDs
  const isIsraeliId =
    docType === 'israeli_id_biometric' ||
    docType === 'israeli_id_blue' ||
    docType === 'israeli_driver_license';

  if (isIsraeliId) {
    const checksum = validateIsraeliId(cleanId);
    if (!checksum.isValid) {
      return {
        success: false,
        is_valid_official_id: true,
        document_type: docType,
        id_number: cleanId,
        first_name: parsed.first_name || '',
        last_name: parsed.last_name || '',
        birth_date: parsed.birth_date || null,
        confidence: Number(parsed.confidence) || 0,
        is_checksum_valid: false,
        rejection_reason: checksum.error || 'invalid_israeli_id_checksum',
        latency_ms,
        raw_output: rawOutput,
        ...(parsed.name_suggestion ? { name_suggestion: parsed.name_suggestion } : {}),
      };
    }

    return {
      success: true,
      is_valid_official_id: true,
      document_type: docType,
      id_number: checksum.paddedId,
      first_name: parsed.first_name || '',
      last_name: parsed.last_name || '',
      birth_date: parsed.birth_date || null,
      confidence: Number(parsed.confidence) || 1,
      is_checksum_valid: true,
      rejection_reason: null,
      latency_ms,
      raw_output: rawOutput,
      ...(parsed.name_suggestion ? { name_suggestion: parsed.name_suggestion } : {}),
    };
  }

  // Passport / International Travel Document
  return {
    success: true,
    is_valid_official_id: true,
    document_type: 'passport',
    id_number: cleanId,
    first_name: parsed.first_name || '',
    last_name: parsed.last_name || '',
    birth_date: parsed.birth_date || null,
    confidence: Number(parsed.confidence) || 1,
    is_checksum_valid: null,
    rejection_reason: null,
    latency_ms,
    raw_output: rawOutput,
    ...(parsed.name_suggestion ? { name_suggestion: parsed.name_suggestion } : {}),
  };
}
