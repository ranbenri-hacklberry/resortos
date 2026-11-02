import { handleCardcomRequest } from '../../../lib/cardcomTap.js';

export async function onRequest(context) {
  const path = [].concat(context.params?.path || []).filter(Boolean).join('/');
  return handleCardcomRequest(context.request, context.env, { path });
}
