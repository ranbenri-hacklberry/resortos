#!/usr/bin/env tsx
/**
 * Benchmark & Test CLI Script for Israeli ID Vision OCR
 *
 * Usage:
 *   npx tsx scripts/benchmark-id-ocr.ts <image_path> [options]
 *
 * Options / Environment Variables:
 *   --url, QWEN_OCR_URL       Endpoint base URL (default: http://localhost:11434/v1)
 *   --model, QWEN_OCR_MODEL   Model name (default: Julioa/Qwen3.8-27B-UD-Q3_K_XL:latest)
 *   --key, QWEN_OCR_API_KEY   API Key if required (default: sk-local)
 *
 * Examples:
 *   npx tsx scripts/benchmark-id-ocr.ts ./test-id.jpg
 *   npx tsx scripts/benchmark-id-ocr.ts ./driver-license.png --url http://127.0.0.1:8000/v1 --model Qwen/Qwen2.5-VL-7B-Instruct
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { processGuestIDDocument } from '../src/idValidation/idOcrService.js';
import { validateIsraeliId } from '../src/idValidation/israeliIdValidator.js';

function parseArgs() {
  const args = process.argv.slice(2);
  let imagePath = '';
  let url = process.env.QWEN_OCR_URL || process.env.OLLAMA_URL || 'http://localhost:11434/v1';
  let model = process.env.QWEN_OCR_MODEL || process.env.OLLAMA_MODEL || 'Julioa/Qwen3.8-27B-UD-Q3_K_XL:latest';
  let key = process.env.QWEN_OCR_API_KEY || 'sk-local';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--url' && args[i + 1]) {
      url = args[++i];
    } else if (arg === '--model' && args[i + 1]) {
      model = args[++i];
    } else if (arg === '--key' && args[i + 1]) {
      key = args[++i];
    } else if (!arg.startsWith('--') && !imagePath) {
      imagePath = arg;
    }
  }

  return { imagePath, url, model, key };
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png': return 'image/png';
    case '.webp': return 'image/webp';
    case '.gif': return 'image/gif';
    case '.bmp': return 'image/bmp';
    case '.jpg':
    case '.jpeg':
    default:
      return 'image/jpeg';
  }
}

async function main() {
  const { imagePath, url, model, key } = parseArgs();

  console.log('======================================================');
  console.log('   ResortOS — Israeli ID Vision OCR & Validation Tool  ');
  console.log('======================================================');
  console.log(`📡 Endpoint: ${url}`);
  console.log(`🤖 Model:    ${model}`);

  if (!imagePath) {
    console.log('\n❌ שגיאה: לא סופק נתיב לתמונה.');
    console.log('\nשימוש לדוגמה:');
    console.log('  npx tsx scripts/benchmark-id-ocr.ts ./samples/id_card.jpg');
    console.log('  npx tsx scripts/benchmark-id-ocr.ts ./samples/passport.jpg --url http://127.0.0.1:8000/v1 --model qwen2.5-vl\n');

    console.log('💡 בדיקה עצמית של מודול ולידציית ספרת ביקורת (Luhn Checksum Self-Test):');
    const sampleIds = ['012345674', '123456782', '54321', '000000000', '123456789'];
    for (const id of sampleIds) {
      const res = validateIsraeliId(id);
      console.log(`  • ID: ${id.padEnd(10)} -> ${res.isValid ? '✅ תקין' : '❌ לא תקין'} (${res.error || `ספרת ביקורת: ${res.checkDigit}`})`);
    }
    process.exit(1);
  }

  const resolvedPath = path.resolve(process.cwd(), imagePath);
  if (!existsSync(resolvedPath)) {
    console.error(`\n❌ קובץ התמונה לא נמצא: ${resolvedPath}`);
    process.exit(1);
  }

  const fileBuffer = readFileSync(resolvedPath);
  const mimeType = getMimeType(resolvedPath);
  const base64 = fileBuffer.toString('base64');
  const fileSizeKb = Math.round(fileBuffer.length / 1024);

  console.log(`📁 Image:    ${resolvedPath} (${fileSizeKb} KB, ${mimeType})`);
  console.log('⏳ שולח תמונה לפענוח במודל Qwen Vision...\n');

  const startBenchmark = Date.now();
  const result = await processGuestIDDocument(
    { imageBase64: base64, mimeType },
    { endpointUrl: url, modelName: model, apiKey: key }
  );
  const totalElapsedMs = Date.now() - startBenchmark;

  console.log('------------------------------------------------------');
  console.log('⏱️  Benchmark & Latency:');
  console.log(`   זמן תגובה כולל: ${totalElapsedMs} ms (קריאת מודל: ${result.latency_ms} ms)`);
  console.log('------------------------------------------------------');

  console.log('📄 Raw Model Output:');
  console.log(result.raw_output || '(אין פלט גולמי)');
  console.log('------------------------------------------------------');

  console.log('📊 תוצאת אימות ופענוח מובנית (Structured Verdict):');
  console.log(`• תעודה רשמית מזוהה:  ${result.is_valid_official_id ? '✅ כן' : '❌ לא (סונן)'}`);
  console.log(`• סוג תעודה:          ${result.document_type}`);
  console.log(`• מספר זיהוי:         ${result.id_number || '(ריק)'}`);
  console.log(`• שם פרטי:            ${result.first_name || '(ריק)'}`);
  console.log(`• שם משפחה:           ${result.last_name || '(ריק)'}`);
  console.log(`• תאריך לידה:         ${result.birth_date || '(לא זוהה)'}`);
  console.log(`• רמת ביטחון:         ${Math.round(result.confidence * 100)}%`);

  if (result.is_checksum_valid !== null) {
    console.log(`• ספרת ביקורת ת"ז:    ${result.is_checksum_valid ? '✅ תקינה (Luhn Valid)' : '❌ שגויה / פסולה'}`);
  } else {
    console.log(`• ספרת ביקורת ת"ז:    ⚪ לא חל על דרכון בינלאומי`);
  }

  if (result.rejection_reason) {
    console.log(`⚠️ סיבת דחייה:         ${result.rejection_reason}`);
  }

  console.log('\n======================================================');
  if (result.success) {
    console.log('🎉 סטטוס סופי: התעודה אומתה בהצלחה ונשמרה עבור האורח! ✅');
  } else {
    console.log(`⛔ סטטוס סופי: התעודה נדחתה [${result.rejection_reason || 'failed'}] ❌`);
  }
  console.log('======================================================');
}

main().catch((err) => {
  console.error('\n❌ שגיאה בלתי צפויה בהרצת הסקריפט:', err);
  process.exit(1);
});
