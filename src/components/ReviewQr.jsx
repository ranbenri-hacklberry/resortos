import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export default function ReviewQr({ value, size = 168, alt = 'QR לדירוג בגוגל' }) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    if (!value) {
      setSrc('');
      return undefined;
    }
    let cancelled = false;
    QRCode.toDataURL(value, {
      width: Math.max(size, 180) * 2,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#1C1917', light: '#FFFFFF' }
    })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc('');
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!value) return null;
  if (!src) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 12,
          background: '#FFF',
          margin: '0 auto'
        }}
      />
    );
  }

  return (
    <img
      src={src}
      width={size}
      height={size}
      alt={alt}
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        background: '#FFF',
        display: 'block',
        margin: '0 auto'
      }}
    />
  );
}

export async function printReviewQr(value, title) {
  if (!value) return;
  const src = await QRCode.toDataURL(value, {
    width: 560,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#1C1917', light: '#FFFFFF' }
  });
  const frame = window.open('', '_blank', 'noopener,noreferrer');
  if (!frame) return;
  const doc = frame.document;
  doc.title = title ? `QR · ${title}` : 'QR';
  const style = doc.createElement('style');
  style.textContent = 'body{margin:0;padding:48px;font-family:system-ui,-apple-system,sans-serif;text-align:center;color:#1C1917;background:#F6F3EC}h1{font-size:22px;margin:0 0 8px}p{margin:0 0 24px;color:#78716C;font-weight:700}img{width:280px;height:280px;background:#fff;border-radius:16px;padding:12px;box-sizing:content-box}';
  doc.head.appendChild(style);
  const heading = doc.createElement('h1');
  heading.textContent = title || 'WhaStar';
  const hint = doc.createElement('p');
  hint.textContent = 'סרקו לדירוג 5 כוכבים בגוגל';
  const img = doc.createElement('img');
  img.src = src;
  img.alt = heading.textContent;
  doc.body.append(heading, hint, img);
  img.onload = () => {
    frame.focus();
    frame.print();
  };
}
