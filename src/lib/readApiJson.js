/**
 * Pages serves the marketing HTML with HTTP 200 when an /api route has no
 * Function. response.json() then fails open into {} and the UI draws an empty
 * thread. Treat a non-JSON body as a failed call.
 */
export async function readApiJson(response) {
  const text = await response.text();
  const trimmed = String(text || '').trim();
  let data = {};
  if (trimmed) {
    const start = trimmed[0];
    if (start !== '{' && start !== '[') {
      const err = new Error('COMMS_UNAVAILABLE');
      err.status = response.status || 502;
      throw err;
    }
    try {
      data = JSON.parse(trimmed);
    } catch {
      const err = new Error('COMMS_UNAVAILABLE');
      err.status = response.status || 502;
      throw err;
    }
  }
  if (!response.ok) {
    const err = new Error(data?.error || data?.message || 'COMMS_FAILED');
    err.status = response.status;
    err.body = data;
    throw err;
  }
  return data;
}
