const HOME = 'https://resortos.co.il';
const HOST_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

const GENERIC_MESSAGE = 'היי קלואי, אשמח לראות את העמוד שלנו ב-ResortOS';

function hostMessage(id: string): string {
  return `היי קלואי, קיבלתי את ההודעה לגבי המתחם (קוד: ${id}) ואשמח לראות את העמוד`;
}

function redirect(location: string, status = 307): Response {
  return new Response(null, {
    status,
    headers: {
      Location: location,
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
}

function whatsappRedirect(phone: string, message: string): Response {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return redirect(HOME);
  return redirect(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`);
}

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname || '/';
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = normalizePath(new URL(request.url).pathname);
    const phone = env.WHATSAPP_PHONE;

    if (path === '/chloe') {
      return whatsappRedirect(phone, GENERIC_MESSAGE);
    }

    if (path.startsWith('/w/')) {
      const id = path.slice(3);
      if (HOST_ID.test(id)) {
        return whatsappRedirect(phone, hostMessage(id));
      }
    }

    return redirect(HOME);
  }
};
