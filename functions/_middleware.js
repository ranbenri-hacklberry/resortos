// Security: deny public access to financial files (step 1, approved by Ran 2026-10-22).
// Rollback: delete this file and revert public/_routes.json, then redeploy.
const BLOCKED_ROOT = new Set([
  '/beinleumi-statement.json',
  '/checks.json',
  '/daily-collection.csv',
  '/hyp-payments.json',
  '/max-credits.json',
]);

export async function onRequest(context) {
  const path = new URL(context.request.url).pathname.toLowerCase();
  if (path === '/finance' || path.startsWith('/finance/') || BLOCKED_ROOT.has(path)) {
    return new Response('Not found', {
      status: 404,
      headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
    });
  }
  return context.next();
}
