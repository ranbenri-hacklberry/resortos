const ORIGIN = 'https://building-counsel-latitude-throws.trycloudflare.com';

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const dest = new URL(incoming.pathname + incoming.search, ORIGIN);
    const headers = new Headers(request.headers);
    headers.delete('Host');
    return fetch(new Request(dest.toString(), {
      method: request.method,
      headers,
      body: request.body,
      redirect: 'manual'
    }));
  }
};
