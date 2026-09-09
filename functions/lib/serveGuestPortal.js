export function serveGuestPortal(context) {
  return context.env.ASSETS.fetch(new URL('/portal/index.html', context.request.url));
}
