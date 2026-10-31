const BRIDGE = (process.env.HOTELOS_BRIDGE_URL || 'http://127.0.0.1:4038').replace(/\/$/, '');

/** Ask the office bridge whether this WhatsApp reply belongs to an open guest call. */
export async function consultCallDesk(phone: string, text: string, sinceMs = 0): Promise<string | null> {
  const trimmed = String(text || '').trim();
  if (!trimmed || !phone) return null;
  try {
    const response = await fetch(`${BRIDGE}/api/internal/call-me/reply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sinceMs ? { phone, text: trimmed, since_ms: sinceMs } : { phone, text: trimmed }),
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { reply?: string | null };
    const reply = String(data.reply || '').trim();
    return reply || null;
  } catch {
    return null;
  }
}
