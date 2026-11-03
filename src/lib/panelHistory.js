import { useEffect, useRef } from 'react';

const KEY = 'resortosPanel';

function notify(delta) {
  if (typeof window === 'undefined') return;
  const current = Number(window.__resortosPanel) || 0;
  const next = Math.max(0, current + delta);
  window.__resortosPanel = next;
  try {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'resortos-panel', open: next > 0 }));
    }
  } catch (_) {}
}

export function usePanelHistory(open, onClose) {
  const flag = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const onPop = () => {
      if (!flag.current) return;
      flag.current = false;
      notify(-1);
      onCloseRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if (!flag.current) return;
      flag.current = false;
      notify(-1);
      if (history.state && history.state[KEY]) history.back();
    };
  }, []);

  useEffect(() => {
    if (open) {
      if (!flag.current) {
        history.pushState({ [KEY]: 1 }, '');
        flag.current = true;
        notify(1);
      }
      return;
    }
    if (!flag.current) return;
    flag.current = false;
    notify(-1);
    if (history.state && history.state[KEY]) history.back();
  }, [open]);
}
