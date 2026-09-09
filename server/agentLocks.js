export async function pullAgentLocksFromCloud() {
  const mailboxUrl = String(process.env.CHECKOUT_MAILBOX_URL || 'https://resortos.app').replace(/\/$/, '');
  const secret = String(process.env.CHECKOUT_MAILBOX_SECRET || '').trim();
  if (!secret) {
    const err = new Error('CHECKOUT_MAILBOX_SECRET is not configured');
    err.status = 503;
    throw err;
  }
  const response = await fetch(`${mailboxUrl}/api/agent-locks`, {
    headers: {
      accept: 'application/json',
      'x-hotelos-mailbox': secret
    },
    signal: AbortSignal.timeout(10000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data.error || `LOCKS_${response.status}`);
    err.status = response.status === 401 ? 502 : (response.status || 502);
    throw err;
  }
  return Array.isArray(data.locks) ? data.locks : [];
}

export async function getAgentLocks(req, res) {
  try {
    const locks = await pullAgentLocksFromCloud();
    return res.json({ locks });
  } catch (err) {
    const status = Number(err.status) || 502;
    return res.status(status).json({ error: err.message || 'LOCKS_FAILED', locks: [] });
  }
}
