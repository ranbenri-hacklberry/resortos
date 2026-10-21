/**
 * Outgoing text spacing (Ran 2026-10-20, bug 5): "📞)בינתיים" → "📞) בינתיים".
 * URLs are left untouched; codes like #2464, times (11:00), prices (₪125) and RTL text are not altered.
 */
const URL_RE = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
const EMOJI = '\\p{Extended_Pictographic}';

function fixChunk(t: string): string {
  return t
    // ")word" / "]word" → ") word" (letters only: keeps "(2)," "(x)." etc.)
    .replace(/([)\]])(?=[\p{L}])/gu, '$1 ')
    // "word(" → "word (" for Hebrew/Latin letters, not for function-like ASCII tokens such as "f(x)" ... keep it simple: only after Hebrew
    .replace(/([\u0590-\u05FF])(\()/gu, '$1 $2')
    // emoji glued to a letter on either side
    .replace(new RegExp(`(${EMOJI})(?=[\\p{L}])`, 'gu'), '$1 ')
    .replace(new RegExp(`([\\p{L}])(?=${EMOJI})`, 'gu'), '$1 ')
    // ".word" / ",word" / "?word" after a sentence in Hebrew (not decimals, not times)
    .replace(/([\u0590-\u05FF][.,!?])(?=[\u0590-\u05FF])/gu, '$1 ')
    // collapse runs of spaces (not newlines)
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n');
}

export function normalizeOutgoingText(text: string): string {
  const s = String(text ?? '');
  if (!s) return s;
  const parts = s.split(URL_RE);
  return parts.map((part, i) => (i % 2 === 1 ? part : fixChunk(part))).join('');
}
