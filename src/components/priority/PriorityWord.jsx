import React, { useEffect, useRef, useState } from 'react';
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Download, List, ListOrdered } from 'lucide-react';
import { getStoredToken } from '../../lib/staffAuth';
import { blankPriorityDoc, docWordCount, normalizePriorityDocs, sanitizeDocHtml } from '../../lib/priorityDocs';

const STORE_KEY = 'hotelos.priorityDocs';
const FONTS = ['David', 'Arial', 'Calibri', 'Times New Roman', 'Tahoma', 'Georgia', 'Courier New'];
const SIZES = [
  ['2', '12'],
  ['3', '14'],
  ['4', '16'],
  ['5', '18'],
  ['6', '24'],
  ['7', '36']
];

function readLocal() {
  try {
    return normalizePriorityDocs(JSON.parse(localStorage.getItem(STORE_KEY) || '{}'));
  } catch {
    return normalizePriorityDocs({});
  }
}

function writeLocal(docs) {
  localStorage.setItem(STORE_KEY, JSON.stringify({ docs }));
}

function authHeaders() {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function PriorityWord() {
  const pageRef = useRef(null);
  const savedRange = useRef(null);
  const skipHtml = useRef('');
  const ready = useRef(false);
  const [docs, setDocs] = useState(readLocal);
  const [activeId, setActiveId] = useState(() => readLocal()[0]?.id || '');
  const [tab, setTab] = useState('home');
  const [font, setFont] = useState('David');
  const [size, setSize] = useState('4');
  const [ink, setInk] = useState('#000000');
  const [mark, setMark] = useState('#fff2cc');
  const [status, setStatus] = useState('נשמר');
  const active = docs.find((doc) => doc.id === activeId) || docs[0];

  useEffect(() => {
    const headers = authHeaders();
    if (!headers.Authorization) {
      ready.current = true;
      return undefined;
    }
    let cancel = false;
    fetch('/api/priority/docs', { headers })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (cancel) return;
        if (body) {
          const next = normalizePriorityDocs(body);
          skipHtml.current = '';
          setDocs(next);
          setActiveId((current) => (next.some((doc) => doc.id === current) ? current : next[0].id));
          writeLocal(next);
        }
        ready.current = true;
      })
      .catch(() => { ready.current = true; });
    return () => { cancel = true; };
  }, []);

  useEffect(() => {
    const page = pageRef.current;
    if (!page || !active) return;
    if (skipHtml.current === active.id) return;
    page.innerHTML = active.html || '<p><br></p>';
    skipHtml.current = active.id;
    try { document.execCommand('styleWithCSS', false, true); } catch { /* older engines */ }
  }, [active]);

  useEffect(() => {
    if (!active || !ready.current) return undefined;
    const timer = window.setTimeout(() => {
      const headers = authHeaders();
      writeLocal(docs);
      if (!headers.Authorization) {
        setStatus('נשמר במחשב הזה');
        return;
      }
      fetch('/api/priority/docs', {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ docs })
      }).then((res) => {
        setStatus(res.ok ? 'נשמר' : 'נשמר במחשב הזה');
      }).catch(() => setStatus('נשמר במחשב הזה'));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [docs, active]);

  function rememberRange() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (pageRef.current?.contains(range.commonAncestorContainer)) savedRange.current = range.cloneRange();
  }

  function restoreRange() {
    const range = savedRange.current;
    const page = pageRef.current;
    if (!range || !page) return;
    page.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function patchActive(partial) {
    setDocs((list) => list.map((doc) => (
      doc.id === active.id ? { ...doc, ...partial, updatedAt: new Date().toISOString() } : doc
    )));
  }

  function capturePage() {
    const html = sanitizeDocHtml(pageRef.current?.innerHTML || '');
    skipHtml.current = active.id;
    patchActive({ html });
    setStatus('שומר…');
  }

  function run(command, value) {
    restoreRange();
    try { document.execCommand('styleWithCSS', false, true); } catch { /* ignore */ }
    document.execCommand(command, false, value);
    capturePage();
  }

  function keepSelection(event) {
    event.preventDefault();
  }

  function openDoc(id) {
    setActiveId(id);
    setTab('home');
  }

  function createDoc() {
    const doc = blankPriorityDoc();
    setDocs((list) => [doc, ...list]);
    setActiveId(doc.id);
    setTab('home');
    setStatus('שומר…');
  }

  function removeDoc(id) {
    setDocs((list) => {
      const next = list.filter((doc) => doc.id !== id);
      return next.length ? next : [blankPriorityDoc()];
    });
    if (id === active?.id) {
      const rest = docs.filter((doc) => doc.id !== id);
      setActiveId((rest[0] || blankPriorityDoc()).id);
    }
  }

  function printDoc() {
    const title = active?.title || 'מסמך';
    const html = sanitizeDocHtml(pageRef.current?.innerHTML || active?.html || '');
    const win = window.open('', '_blank', 'noopener,noreferrer');
    if (!win) return;
    win.document.write(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${title.replace(/[<>]/g, '')}</title><style>body{font:16px David,"Times New Roman",serif;margin:2.2cm;line-height:1.5;color:#000}h1{font-size:28px}h2{font-size:22px}</style></head><body>${html}</body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  function downloadDocFile(ext = 'html') {
    const rawTitle = (active?.title || 'מסמך').trim();
    const safeTitle = rawTitle.replace(/[<>:"/\\|?*]/g, '_') || 'מסמך';
    const html = sanitizeDocHtml(pageRef.current?.innerHTML || active?.html || '<p></p>');
    let content = '';
    let mimeType = 'text/html';
    if (ext === 'doc') {
      mimeType = 'application/msword';
      content = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>${safeTitle}</title><style>body{font-family:Arial,Tahoma,sans-serif;direction:rtl;padding:24px;}</style></head><body>${html}</body></html>`;
    } else {
      content = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${safeTitle}</title><style>body{font:15px David,Arial,sans-serif;margin:2cm;line-height:1.6;color:#000;direction:rtl;}h1{font-size:22px}h2{font-size:18px}</style></head><body>${html}</body></html>`;
    }
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `${safeTitle}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
    setStatus('הקובץ הורד למחשב');
  }

  const words = docWordCount(pageRef.current?.innerHTML || active?.html || '');

  return (
    <div className="word-app">
      <div className="word-tabs">
        <button type="button" className={tab === 'file' ? 'is-on' : ''} onClick={() => setTab('file')}>קובץ</button>
        <button type="button" className={tab === 'home' ? 'is-on' : ''} onClick={() => setTab('home')}>בית</button>
        <span className="word-doc-title">{active?.title || ''}</span>
        <button
          type="button"
          style={{
            marginInlineStart: '12px',
            background: 'rgba(255,255,255,0.15)',
            border: '1px solid rgba(255,255,255,0.3)',
            color: '#fff',
            borderRadius: '4px',
            padding: '3px 9px',
            fontSize: '11px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px'
          }}
          title="הורד קובץ זה ישירות למחשב שלך"
          onClick={() => downloadDocFile('html')}
        >
          <Download size={12} /> הורד למחשב
        </button>
        <em>{status}</em>
      </div>
      {tab === 'file' ? (
        <div className="word-backstage">
          <aside>
            <button type="button" onClick={createDoc}>מסמך חדש</button>
            <button type="button" onClick={() => downloadDocFile('html')}>📥 הורד למחשב (HTML)</button>
            <button type="button" onClick={() => downloadDocFile('doc')}>📥 הורד כ-Word (.doc)</button>
            <button type="button" onClick={printDoc}>הדפס</button>
            <button type="button" onClick={() => setTab('home')}>חזרה למסמך</button>
          </aside>
          <div className="word-recent">
            <h2>אחרונים</h2>
            {docs.map((doc) => (
              <div key={doc.id} className={doc.id === active?.id ? 'is-on' : ''}>
                <button type="button" onClick={() => openDoc(doc.id)}>
                  <b>{doc.title}</b>
                  <span>{doc.updatedAt ? new Date(doc.updatedAt).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                </button>
                {docs.length > 1 ? <button type="button" className="word-drop" onClick={() => removeDoc(doc.id)}>מחק</button> : null}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="word-ribbon" onMouseDown={keepSelection}>
            <div className="word-group">
              <div className="word-tools">
                <button type="button" title="בטל" onClick={() => run('undo')}>↶</button>
                <button type="button" title="בצע שוב" onClick={() => run('redo')}>↷</button>
              </div>
              <small>עריכה</small>
            </div>
            <div className="word-group word-font">
              <div className="word-tools">
                <select
                  aria-label="גופן"
                  value={font}
                  onMouseDown={(event) => event.stopPropagation()}
                  onChange={(event) => { setFont(event.target.value); run('fontName', event.target.value); }}
                >
                  {FONTS.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
                <select
                  aria-label="גודל גופן"
                  value={size}
                  onMouseDown={(event) => event.stopPropagation()}
                  onChange={(event) => { setSize(event.target.value); run('fontSize', event.target.value); }}
                >
                  {SIZES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <button type="button" className="word-b" title="מודגש" onClick={() => run('bold')}>B</button>
                <button type="button" className="word-i" title="נטוי" onClick={() => run('italic')}>I</button>
                <button type="button" className="word-u" title="קו תחתון" onClick={() => run('underline')}>U</button>
                <label className="word-ink" title="צבע גופן">
                  A
                  <input type="color" value={ink} onMouseDown={(event) => event.stopPropagation()} onChange={(event) => { setInk(event.target.value); run('foreColor', event.target.value); }} />
                </label>
                <label className="word-mark" title="צבע סימון" style={{ background: mark }}>
                  <input type="color" value={mark} onMouseDown={(event) => event.stopPropagation()} onChange={(event) => { setMark(event.target.value); run('hiliteColor', event.target.value); }} />
                </label>
              </div>
              <small>גופן</small>
            </div>
            <div className="word-group">
              <div className="word-tools">
                <button type="button" title="ישר לימין" onClick={() => run('justifyRight')}><AlignRight size={16} /></button>
                <button type="button" title="מרכז" onClick={() => run('justifyCenter')}><AlignCenter size={16} /></button>
                <button type="button" title="ישר לשמאל" onClick={() => run('justifyLeft')}><AlignLeft size={16} /></button>
                <button type="button" title="ישר לשני הצדדים" onClick={() => run('justifyFull')}><AlignJustify size={16} /></button>
                <button type="button" title="תבליטים" onClick={() => run('insertUnorderedList')}><List size={16} /></button>
                <button type="button" title="מספור" onClick={() => run('insertOrderedList')}><ListOrdered size={16} /></button>
              </div>
              <small>פסקה</small>
            </div>
            <div className="word-group word-styles">
              <div className="word-tools">
                <button type="button" className="style-normal" onClick={() => run('formatBlock', 'p')}>רגיל</button>
                <button type="button" className="style-h1" onClick={() => run('formatBlock', 'h1')}>כותרת 1</button>
                <button type="button" className="style-h2" onClick={() => run('formatBlock', 'h2')}>כותרת 2</button>
              </div>
              <small>סגנונות</small>
            </div>
          </div>
          <div className="word-titlebar">
            <input
              aria-label="שם המסמך"
              value={active?.title || ''}
              onChange={(event) => patchActive({ title: event.target.value.slice(0, 80) })}
            />
          </div>
          <div className="word-stage">
            <div className="word-ruler" aria-hidden="true">
              {Array.from({ length: 17 }, (_, index) => <span key={index}>{index}</span>)}
            </div>
            <div
              ref={pageRef}
              className="word-page"
              contentEditable
              suppressContentEditableWarning
              dir="rtl"
              role="textbox"
              aria-label="עמוד המסמך"
              spellCheck
              onMouseUp={rememberRange}
              onKeyUp={rememberRange}
              onInput={capturePage}
            />
          </div>
          <div className="word-status">
            <span>עמוד 1 מתוך 1</span>
            <span>{words} מילים</span>
            <span>עברית</span>
            <span>100%</span>
          </div>
        </>
      )}
    </div>
  );
}
