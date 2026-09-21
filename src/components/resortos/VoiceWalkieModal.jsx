import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Languages, Loader2, Mic, Volume2, X, Zap, AlertTriangle, Radio, Camera, ImagePlus } from 'lucide-react';
import { createStaffTask } from '../../lib/tasksService';
import { enrichTaskData, isClarificationUtterance } from '../../lib/fieldUnitCatalog';
import FieldNavLinks from '../FieldNavLinks';
import {
  FIELD_UI_LANGUAGES,
  FIELD_UI_LANG_BY_CODE,
  defaultPartnerLang,
  normalizeFieldUiLang
} from '../../lib/fieldUiLanguages';

export const WALKIE_LANGS = FIELD_UI_LANGUAGES;
const LANG_BY_CODE = FIELD_UI_LANG_BY_CODE;
const BCP47 = Object.fromEntries(FIELD_UI_LANGUAGES.map((row) => [row.code, row.bcp47]));
const MAX_TASK_PHOTOS = 4;

function SpeechRecognitionCtor() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function resolveWorkerLang(currentLang) {
  return defaultPartnerLang(currentLang);
}

export function speakText(text, langCode) {
  if (typeof window === 'undefined' || !window.speechSynthesis || !text) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(String(text));
  utter.lang = BCP47[langCode] || BCP47.he;
  utter.rate = 0.95;
  window.speechSynthesis.speak(utter);
}

/** Resize phone photos before storing on the ops ticket. */
function fileToTaskPhotoDataUrl(file, maxEdge = 1280) {
  return new Promise((resolve, reject) => {
    if (!file || !String(file.type || '').startsWith('image/')) {
      reject(new Error('NOT_IMAGE'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('READ_FAIL'));
    reader.onload = () => {
      const raw = String(reader.result || '');
      const img = new Image();
      img.onerror = () => resolve(raw);
      img.onload = () => {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!w || !h || (w <= maxEdge && h <= maxEdge)) {
          resolve(raw);
          return;
        }
        const scale = maxEdge / Math.max(w, h);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(raw);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = raw;
    };
    reader.readAsDataURL(file);
  });
}

function translatorBaseUrl() {
  const raw = import.meta.env.VITE_TRANSLATOR_API_URL;
  if (raw === '' || raw === '/') return '';
  const fallback = 'http://localhost:8000';
  const configured = String(raw || fallback).replace(/\/$/, '');
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const isLocalHost = /^(localhost|127\.0\.0\.1)$/.test(host);
    if (!isLocalHost && /localhost|127\.0\.0\.1/.test(configured)) {
      return '';
    }
  }
  return configured;
}

async function translateUtterance(text, sourceLang, targetLang, mode = 'conversation') {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return { translation: '', is_task: false, is_issue: false, task_data: null };
  }
  if (sourceLang === targetLang && mode !== 'task_dispatch') {
    return {
      translation: trimmed,
      translated_text: trimmed,
      is_task: false,
      is_issue: false,
      task_data: null
    };
  }

  const base = translatorBaseUrl();
  const res = await fetch(`${base}/api/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: trimmed,
      source_lang: sourceLang,
      target_lang: targetLang,
      source: sourceLang,
      target: targetLang,
      mode
    })
  });
  if (!res.ok) throw new Error(`translate_http_${res.status}`);
  const data = await res.json().catch(() => ({}));
  const translation = String(
    data.translation
    || data.translated_text
    || data.translated
    || data.text
    || data.result
    || ''
  ).trim();
  return {
    translation,
    translated_text: translation,
    is_task: Boolean(data.is_task) || mode === 'task_dispatch',
    is_issue: Boolean(data.is_issue),
    task_data: data.task_data && typeof data.task_data === 'object' ? data.task_data : (
      mode === 'task_dispatch'
        ? {
          unit_number: null,
          task_he: translation || trimmed,
          task_translated: translation || trimmed,
          category: 'general',
          priority: 'normal'
        }
        : null
    )
  };
}

async function probeTranslator() {
  try {
    const base = translatorBaseUrl();
    const res = await fetch(`${base}/api/status`, { method: 'GET' });
    if (!res.ok) return false;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return false;
    const data = await res.json().catch(() => ({}));
    return data.status === 'connected' || Boolean(data.models?.length);
  } catch (_) {
    return false;
  }
}

/**
 * Face-to-face walkie + task dictation for Field Ops.
 */
export default function VoiceWalkieModal({
  isOpen,
  onClose,
  currentLang = 'th',
  theme = 'dark',
  units = [],
  actor = null,
  onTaskCreated = null
}) {
  const isLight = theme === 'light';
  const deviceLang = useMemo(() => normalizeFieldUiLang(currentLang), [currentLang]);
  const [partnerLang, setPartnerLang] = useState(() => defaultPartnerLang(deviceLang));
  const [workMode, setWorkMode] = useState('conversation');
  const [toast, setToast] = useState('');
  const [savingBubbleId, setSavingBubbleId] = useState('');
  const [liveHeard, setLiveHeard] = useState('');
  const [hearState, setHearState] = useState('idle'); // idle | listening | understood | translating
  const [translatorOk, setTranslatorOk] = useState(null);
  const unitsRef = useRef(units);

  useEffect(() => { unitsRef.current = units; }, [units]);

  useEffect(() => {
    if (!isOpen) return;
    setPartnerLang(defaultPartnerLang(deviceLang));
    setWorkMode('conversation');
    setLiveHeard('');
    setHearState('idle');
    let cancelled = false;
    probeTranslator().then((ok) => {
      if (!cancelled) setTranslatorOk(ok);
    });
    return () => { cancelled = true; };
  }, [isOpen, deviceLang]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(''), 2400);
    return () => clearTimeout(id);
  }, [toast]);

  const isTaskMode = workMode === 'task_dispatch';
  const managerLang = deviceLang;
  const workerLang = partnerLang;
  const workerMeta = LANG_BY_CODE[workerLang] || LANG_BY_CODE.th;
  const managerMeta = LANG_BY_CODE[managerLang] || LANG_BY_CODE.he;
  const isRtlUi = deviceLang === 'he' || deviceLang === 'ar';
  const partnerChoices = useMemo(
    () => FIELD_UI_LANGUAGES.filter((row) => row.code !== deviceLang),
    [deviceLang]
  );

  const [bubbles, setBubbles] = useState([]);
  const [listeningSide, setListeningSide] = useState(null);
  const [pttSide, setPttSide] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [modeHint, setModeHint] = useState('החזק לדבר');

  const recognitionRef = useRef(null);
  const pttActiveRef = useRef(false);
  const toggleActiveRef = useRef(false);
  const activeSideRef = useRef(null);
  const workerLangRef = useRef(workerLang);
  const managerLangRef = useRef(managerLang);
  const workModeRef = useRef(workMode);
  const listRef = useRef(null);
  const pointerDownAtRef = useRef(0);

  useEffect(() => { workerLangRef.current = workerLang; }, [workerLang]);
  useEffect(() => { managerLangRef.current = managerLang; }, [managerLang]);
  useEffect(() => { workModeRef.current = workMode; }, [workMode]);

  const colors = {
    bg: isLight ? '#FAF8F3' : '#141416',
    text: isLight ? '#1C1917' : '#F8FAFC',
    muted: isLight ? '#57534E' : '#94A3B8',
    line: isLight ? 'rgba(28,25,23,0.1)' : 'rgba(255,255,255,0.1)',
    accent: '#6366F1'
  };

  const stopRecognition = useCallback(() => {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    activeSideRef.current = null;
    setListeningSide(null);
    if (!rec) return;
    try {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      rec.stop();
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopRecognition();
      pttActiveRef.current = false;
      toggleActiveRef.current = false;
      setPttSide(null);
      setBusy(false);
      setError('');
      setLiveHeard('');
      setHearState('idle');
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    }
  }, [isOpen, stopRecognition]);

  useEffect(() => () => stopRecognition(), [stopRecognition]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [bubbles, liveHeard]);

  const pushBubble = useCallback((bubble) => {
    setBubbles((prev) => [...prev.slice(-40), { id: `${Date.now()}_${Math.random()}`, ...bubble }]);
  }, []);

  const handleFinalTranscript = useCallback(async (side, transcript) => {
    const sourceText = String(transcript || '').trim();
    if (!sourceText) return;

    const taskMode = workModeRef.current === 'task_dispatch';
    const activeWorker = workerLangRef.current;
    const activeManager = managerLangRef.current;
    const sourceLang = taskMode
      ? activeManager
      : (side === 'manager' ? activeManager : activeWorker);
    const targetLang = taskMode
      ? 'he'
      : (side === 'manager' ? activeWorker : activeManager);

    // Clarification about complex → attach to last unresolved task, don't invent a new one.
    if (taskMode && isClarificationUtterance(sourceText)) {
      setHearState('understood');
      setLiveHeard(sourceText);
      setBubbles((prev) => {
        const idx = [...prev].reverse().findIndex((b) => (
          b.side === 'task' && b.task_data && !b.task_data.resolved && b.boardStatus !== 'saved'
        ));
        if (idx < 0) {
          return [...prev.slice(-40), {
            id: `${Date.now()}_${Math.random()}`,
            side: 'system',
            sourceText,
            translatedText: 'בחרו מתחם מהרשימה למטה על המשימה הפתוחה',
            is_task: false
          }];
        }
        const realIdx = prev.length - 1 - idx;
        return prev.map((row, i) => {
          if (i !== realIdx) return row;
          const task_data = enrichTaskData(row.task_data || {}, {
            units: unitsRef.current,
            spokenText: row.sourceText
          });
          return {
            ...row,
            task_data: { ...task_data, needs_property: true },
            clarifyHint: 'בחרו מתחם מהרשימה — בלי מתחם אי אפשר להוסיף ללוח'
          };
        });
      });
      setTimeout(() => {
        setLiveHeard('');
        setHearState('idle');
      }, 900);
      return;
    }

    setBusy(true);
    setHearState('translating');
    setError('');
    try {
      const result = await translateUtterance(
        sourceText,
        sourceLang,
        targetLang,
        taskMode ? 'task_dispatch' : 'conversation'
      );
      const spoken = result.translation || sourceText;
      const task_data = taskMode || result.is_task || result.is_issue
        ? {
          ...enrichTaskData(result.task_data || {
            unit_number: null,
            task_he: spoken,
            task_translated: spoken,
            category: result.is_issue ? 'maintenance' : 'general',
            priority: 'normal'
          }, { units: unitsRef.current, spokenText: sourceText }),
          photos: []
        }
        : result.task_data;
      setHearState('understood');
      pushBubble({
        side: taskMode ? 'task' : side,
        sourceLang,
        targetLang,
        sourceText,
        translatedText: spoken,
        is_task: Boolean(result.is_task) || taskMode,
        is_issue: Boolean(result.is_issue),
        task_data,
        boardStatus: 'idle',
        clarifyHint: task_data?.needs_property
          ? (task_data.unit_number != null
            ? `בקתה ${task_data.unit_number} קיימת בכמה מתחמים — בחרו מתחם`
            : 'בחרו מתחם מהרשימה כדי לזהות את היחידה')
          : ''
      });
      if (!taskMode) {
        speakText(spoken, targetLang);
      } else if (task_data?.resolved && task_data?.task_he) {
        speakText(task_data.task_he, 'he');
      } else if (task_data?.needs_property) {
        speakText('באיזה מתחם?', 'he');
      }
      setTranslatorOk(true);
    } catch (err) {
      setTranslatorOk(false);
      setError('תרגום נכשל — אין חיבור לשרת ה-AI');
      setHearState('idle');
      const fallbackTask = taskMode
        ? enrichTaskData({
          unit_number: null,
          task_he: sourceText,
          task_translated: sourceText,
          category: 'general',
          priority: 'normal'
        }, { units: unitsRef.current, spokenText: sourceText })
        : null;
      pushBubble({
        side: taskMode ? 'task' : side,
        sourceLang,
        targetLang,
        sourceText,
        translatedText: sourceText,
        failed: true,
        is_task: taskMode,
        is_issue: false,
        task_data: fallbackTask,
        boardStatus: 'idle',
        clarifyHint: fallbackTask?.needs_property ? 'בחרו מתחם מהרשימה' : ''
      });
    } finally {
      setBusy(false);
      setTimeout(() => {
        setLiveHeard('');
        setHearState((prev) => (prev === 'listening' ? prev : 'idle'));
      }, 900);
    }
  }, [pushBubble]);

  const pickPropertyForBubble = useCallback((bubbleId, propertyId) => {
    setBubbles((prev) => prev.map((row) => {
      if (row.id !== bubbleId) return row;
      const task_data = enrichTaskData(row.task_data || {}, {
        units: unitsRef.current,
        spokenText: row.sourceText,
        property_id: propertyId
      });
      return {
        ...row,
        task_data: {
          ...task_data,
          photos: Array.isArray(row.task_data?.photos) ? row.task_data.photos : []
        },
        clarifyHint: task_data.resolved ? '' : 'עדיין לא זוהתה יחידה במתחם הזה'
      };
    }));
  }, []);

  const updateBubbleTaskText = useCallback((bubbleId, text) => {
    setBubbles((prev) => prev.map((row) => {
      if (row.id !== bubbleId) return row;
      if (row.side === 'task' || row.is_task) {
        return {
          ...row,
          task_data: {
            ...(row.task_data || {}),
            task_he: text,
            task_translated: text
          }
        };
      }
      return { ...row, translatedText: text };
    }));
  }, []);

  const addBubblePhotos = useCallback(async (bubbleId, fileList) => {
    const files = Array.from(fileList || []).slice(0, MAX_TASK_PHOTOS);
    if (!files.length) return;
    const encoded = [];
    for (const file of files) {
      try {
        encoded.push(await fileToTaskPhotoDataUrl(file));
      } catch (_) {}
    }
    if (!encoded.length) return;
    setBubbles((prev) => prev.map((row) => {
      if (row.id !== bubbleId) return row;
      const existing = Array.isArray(row.task_data?.photos) ? row.task_data.photos : [];
      return {
        ...row,
        task_data: {
          ...(row.task_data || {}),
          photos: [...existing, ...encoded].slice(0, MAX_TASK_PHOTOS)
        }
      };
    }));
  }, []);

  const removeBubblePhoto = useCallback((bubbleId, index) => {
    setBubbles((prev) => prev.map((row) => {
      if (row.id !== bubbleId) return row;
      const photos = (row.task_data?.photos || []).filter((_, i) => i !== index);
      return {
        ...row,
        task_data: { ...(row.task_data || {}), photos }
      };
    }));
  }, []);

  const addDetectedTask = useCallback(async (bubble) => {
    if (!bubble?.id || bubble.boardStatus === 'saved' || savingBubbleId) return;
    const task = bubble.task_data || {};
    if (!task.resolved || !task.unit_id) {
      setToast('חייבים לבחור מתחם לפני הוספה ללוח');
      return;
    }
    const title = String(task.task_he || bubble.sourceText || '').trim();
    if (!title) {
      setToast('ערכו את נוסח המשימה לפני השמירה');
      return;
    }
    setSavingBubbleId(bubble.id);
    setBubbles((prev) => prev.map((row) => (
      row.id === bubble.id ? { ...row, boardStatus: 'saving' } : row
    )));
    try {
      await createStaffTask({
        unit_id: task.unit_id,
        unit_number: task.unit_number,
        property_id: task.property_id,
        property_name: task.property_he,
        unit_label: task.sign_he || task.unit_name,
        title_he: title,
        title_translated: task.task_translated || title,
        target_lang: deviceLang === 'he' ? 'th' : deviceLang,
        category: task.category || (bubble.is_issue ? 'maintenance' : 'general'),
        priority: task.priority || 'normal',
        is_issue: Boolean(bubble.is_issue),
        spoken_text: bubble.sourceText,
        image_urls: Array.isArray(task.photos) ? task.photos : [],
        units,
        actor
      });
      setBubbles((prev) => prev.map((row) => (
        row.id === bubble.id ? { ...row, boardStatus: 'saved' } : row
      )));
      setToast('המשימה נקלטה בלוח השטח ✓');
      if (typeof onTaskCreated === 'function') onTaskCreated();
    } catch (err) {
      const code = err?.message || '';
      setBubbles((prev) => prev.map((row) => (
        row.id === bubble.id ? { ...row, boardStatus: 'error' } : row
      )));
      setToast(code === 'UNIT_NOT_FOUND'
        ? 'לא זוהתה יחידה — בחרו מתחם מהרשימה'
        : 'שמירת משימה נכשלה');
    } finally {
      setSavingBubbleId('');
    }
  }, [actor, deviceLang, onTaskCreated, savingBubbleId, units]);

  const startRecognition = useCallback((side, { continuous }) => {
    const Ctor = SpeechRecognitionCtor();
    if (!Ctor) {
      setError('הדפדפן לא תומך בזיהוי דיבור (נסו Chrome)');
      return false;
    }

    stopRecognition();
    const taskMode = workModeRef.current === 'task_dispatch';
    const activeWorker = workerLangRef.current;
    const activeManager = managerLangRef.current;
    const rec = new Ctor();
    rec.lang = taskMode || side === 'manager'
      ? (BCP47[activeManager] || BCP47.he)
      : (BCP47[activeWorker] || BCP47.th);
    rec.interimResults = true;
    rec.continuous = Boolean(continuous);
    rec.maxAlternatives = 1;

    activeSideRef.current = side;
    recognitionRef.current = rec;
    setListeningSide(side);
    setHearState('listening');
    setLiveHeard('');
    setError('');

    rec.onresult = (event) => {
      let finalChunk = '';
      let interimChunk = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const row = event.results[i];
        const piece = row[0]?.transcript || '';
        if (row.isFinal) finalChunk += piece;
        else interimChunk += piece;
      }
      const live = (interimChunk || finalChunk).trim();
      if (live) {
        setLiveHeard(live);
        setHearState(finalChunk ? 'understood' : 'listening');
      }
      if (finalChunk.trim()) {
        handleFinalTranscript(side, finalChunk);
      }
    };

    rec.onerror = (event) => {
      if (event?.error === 'aborted' || event?.error === 'no-speech') return;
      setError(event?.error === 'not-allowed'
        ? 'יש לאשר גישה למיקרופון'
        : 'שגיאה בזיהוי דיבור');
      setHearState('idle');
    };

    rec.onend = () => {
      if (recognitionRef.current === rec) {
        recognitionRef.current = null;
        activeSideRef.current = null;
        setListeningSide(null);
      }
    };

    try {
      rec.start();
      return true;
    } catch (_) {
      setError('לא ניתן להפעיל מיקרופון');
      stopRecognition();
      setHearState('idle');
      return false;
    }
  }, [handleFinalTranscript, stopRecognition]);

  const endPtt = useCallback(() => {
    if (!pttActiveRef.current) return;
    pttActiveRef.current = false;
    setPttSide(null);
    stopRecognition();
  }, [stopRecognition]);

  const onPressStart = useCallback((side, event) => {
    event.preventDefault();
    pointerDownAtRef.current = Date.now();
    pttActiveRef.current = true;
    toggleActiveRef.current = false;
    setPttSide(side);
    setModeHint('מקליט… שחררו לסיים');
    startRecognition(side, { continuous: true });
  }, [startRecognition]);

  const onPressEnd = useCallback((side, event) => {
    event.preventDefault();
    const heldMs = Date.now() - pointerDownAtRef.current;
    if (heldMs < 280) {
      pttActiveRef.current = false;
      setPttSide(null);
      if (toggleActiveRef.current && activeSideRef.current === side) {
        toggleActiveRef.current = false;
        stopRecognition();
        setModeHint('החזק לדבר');
        setHearState('idle');
        return;
      }
      toggleActiveRef.current = true;
      setModeHint('הקלטה פעילה · לחיצה לעצירה');
      if (activeSideRef.current !== side) {
        startRecognition(side, { continuous: true });
      }
      return;
    }
    if (toggleActiveRef.current) return;
    endPtt();
    setModeHint('החזק לדבר');
  }, [endPtt, startRecognition, stopRecognition]);

  const selectPartnerLang = (code) => {
    if (!LANG_BY_CODE[code] || code === deviceLang) return;
    stopRecognition();
    pttActiveRef.current = false;
    toggleActiveRef.current = false;
    setPttSide(null);
    setPartnerLang(code);
  };

  if (!isOpen) return null;

  const deviceListening = listeningSide === 'manager' || listeningSide === 'task';
  const partnerListening = listeningSide === 'worker';
  const hearing = hearState === 'listening' || Boolean(listeningSide);

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center'
      }}
    >
      <div
        role="dialog"
        aria-label="תרגום קולי"
        dir={isRtlUi ? 'rtl' : 'ltr'}
        onClick={(event) => event.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 560,
          maxHeight: 'min(96dvh, 920px)',
          height: 'min(96dvh, 920px)',
          background: colors.bg,
          color: colors.text,
          borderRadius: '22px 22px 0 0',
          border: `1px solid ${colors.line}`,
          boxShadow: '0 -20px 50px rgba(0,0,0,0.45)',
          display: 'flex',
          flexDirection: 'column',
          paddingBottom: 'calc(0.85rem + env(safe-area-inset-bottom))'
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '1rem 1rem 0.65rem',
          borderBottom: `1px solid ${colors.line}`
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: 'rgba(99,102,241,0.15)',
              color: colors.accent,
              display: 'grid',
              placeItems: 'center'
            }}>
              <Languages size={20} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 900, fontSize: '1.05rem' }}>
                {isTaskMode ? 'הכתבת משימות' : 'שיחה פנים מול פנים'}
              </div>
              <div style={{ color: colors.muted, fontSize: '0.72rem', fontWeight: 700 }}>
                {isTaskMode
                  ? `מדברים ב${managerMeta.he} · AI מבין ומנסח משימה`
                  : `אני (${managerMeta.he}) ↔ צד שני (${workerMeta.he})`}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: '0.68rem',
              fontWeight: 800,
              borderRadius: 999,
              padding: '4px 8px',
              background: translatorOk === false
                ? 'rgba(239,68,68,0.15)'
                : translatorOk
                  ? 'rgba(16,185,129,0.15)'
                  : 'rgba(148,163,184,0.15)',
              color: translatorOk === false ? '#F87171' : translatorOk ? '#34D399' : colors.muted
            }}>
              {translatorOk === false ? 'AI מנותק' : translatorOk ? 'AI מחובר' : 'AI…'}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="סגור"
              style={{
                width: 40,
                height: 40,
                borderRadius: 999,
                border: `1px solid ${colors.line}`,
                background: 'transparent',
                color: colors.muted,
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer'
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div style={{ padding: '0.65rem 1rem 0.35rem', borderBottom: `1px solid ${colors.line}` }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 6,
            padding: 4,
            borderRadius: 12,
            background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)'
          }}>
            {[
              { id: 'conversation', label: 'שיחה חופשית' },
              { id: 'task_dispatch', label: 'הכתבת משימות' }
            ].map((mode) => {
              const active = workMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => {
                    setWorkMode(mode.id);
                    setBubbles([]);
                    setLiveHeard('');
                    setHearState('idle');
                    stopRecognition();
                  }}
                  style={{
                    minHeight: 40,
                    border: 'none',
                    borderRadius: 10,
                    cursor: 'pointer',
                    fontWeight: 900,
                    fontSize: '0.8rem',
                    background: active ? '#6366F1' : 'transparent',
                    color: active ? '#FFF' : colors.muted
                  }}
                >
                  {mode.label}
                </button>
              );
            })}
          </div>
        </div>

        {!isTaskMode ? (
          <div style={{
            padding: '0.45rem 1rem 0.4rem',
            borderBottom: `1px solid ${colors.line}`
          }}>
            <div style={{
              fontSize: '0.68rem',
              fontWeight: 800,
              color: colors.muted,
              marginBottom: 6
            }}>
              שפת הצד השני · אני תמיד ב{managerMeta.he}
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${partnerChoices.length}, minmax(0, 1fr))`,
              gap: 5
            }}>
              {partnerChoices.map((lang) => {
                const active = partnerLang === lang.code;
                return (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => selectPartnerLang(lang.code)}
                    style={{
                      minHeight: 44,
                      borderRadius: 10,
                      border: active ? '2px solid #6366F1' : `1px solid ${colors.line}`,
                      background: active ? 'rgba(99,102,241,0.16)' : (isLight ? '#FFF' : 'rgba(255,255,255,0.03)'),
                      color: colors.text,
                      cursor: 'pointer',
                      padding: '4px 2px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 1
                    }}
                  >
                    <span style={{ fontSize: '0.95rem' }}>{lang.flag}</span>
                    <span style={{ fontSize: '0.6rem', fontWeight: 900 }}>{lang.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div
          ref={listRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0.85rem 1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            minHeight: isTaskMode ? 200 : 280
          }}
        >
          {!bubbles.length ? (
            <div style={{
              margin: 'auto',
              textAlign: 'center',
              color: colors.muted,
              fontWeight: 700,
              fontSize: '0.9rem',
              lineHeight: 1.5,
              padding: '1.4rem 0.5rem'
            }}>
              {isTaskMode
                ? 'הכתיבו משימה עם מתחם — למשל «בטאג׳ בקתה 3 תקלת חשמל». אם חסר מתחם תופיע רשימה לבחירה.'
                : 'כאן יופיעו התרגומים. בחרו שפת צד שני והחזיקו לדבר.'}
            </div>
          ) : bubbles.map((bubble) => {
            const fromMe = bubble.side === 'manager';
            const isTask = bubble.side === 'task' || (isTaskMode && bubble.side !== 'system' && bubble.is_task);
            if (bubble.side === 'system') {
              return (
                <div
                  key={bubble.id}
                  style={{
                    alignSelf: 'stretch',
                    borderRadius: 12,
                    border: `1px dashed ${colors.line}`,
                    padding: '0.7rem 0.8rem',
                    color: colors.muted,
                    fontWeight: 800,
                    fontSize: '0.82rem'
                  }}
                >
                  {bubble.translatedText || bubble.sourceText}
                </div>
              );
            }
            const needsProperty = Boolean(bubble.task_data?.needs_property && !bubble.task_data?.resolved);
            const candidates = bubble.task_data?.candidate_properties || [];
            return (
              <div
                key={bubble.id}
                style={{
                  alignSelf: isTask ? 'stretch' : (fromMe ? 'flex-start' : 'flex-end'),
                  width: isTask ? '100%' : undefined,
                  maxWidth: isTask ? '100%' : '94%',
                  background: isTask
                    ? (needsProperty ? 'rgba(245,158,11,0.1)' : 'rgba(99,102,241,0.12)')
                    : (fromMe ? 'rgba(37,99,235,0.14)' : 'rgba(16,185,129,0.14)'),
                  border: `1px solid ${isTask
                    ? (needsProperty ? 'rgba(245,158,11,0.45)' : 'rgba(99,102,241,0.35)')
                    : (fromMe ? 'rgba(37,99,235,0.35)' : 'rgba(16,185,129,0.35)')}`,
                  borderRadius: 16,
                  padding: '0.85rem 0.9rem'
                }}
              >
                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: colors.muted, marginBottom: 6 }}>
                  {isTask ? 'הבנת AI · משימה' : `${LANG_BY_CODE[bubble.sourceLang]?.short || bubble.sourceLang} → ${LANG_BY_CODE[bubble.targetLang]?.short || bubble.targetLang}`}
                  {bubble.failed ? ' · ללא רשת' : ''}
                </div>
                <div style={{
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  color: colors.muted,
                  lineHeight: 1.4,
                  marginBottom: 8
                }}>
                  {bubble.sourceText}
                </div>
                {!isTask ? (
                  <div>
                    <div style={{
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      color: colors.muted,
                      marginBottom: 4
                    }}>
                      תרגום · ניתן לערוך
                    </div>
                    <textarea
                      value={bubble.translatedText || ''}
                      onChange={(event) => updateBubbleTaskText(bubble.id, event.target.value)}
                      rows={3}
                      style={{
                        width: '100%',
                        borderRadius: 12,
                        border: `1px solid ${colors.line}`,
                        background: isLight ? '#FFF' : 'rgba(0,0,0,0.25)',
                        color: colors.text,
                        padding: '0.65rem 0.75rem',
                        fontWeight: 800,
                        fontSize: '1.02rem',
                        lineHeight: 1.4,
                        resize: 'vertical'
                      }}
                    />
                  </div>
                ) : (
                  <div style={{
                    fontWeight: 900,
                    fontSize: '1.02rem',
                    lineHeight: 1.4
                  }}>
                    <div style={{
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      color: colors.muted,
                      marginBottom: 4
                    }}>
                      נוסח משימה · ערכו אחרי ההקראה
                    </div>
                    <textarea
                      value={bubble.task_data?.task_he || bubble.translatedText || ''}
                      onChange={(event) => updateBubbleTaskText(bubble.id, event.target.value)}
                      rows={3}
                      style={{
                        width: '100%',
                        borderRadius: 12,
                        border: `1px solid ${colors.line}`,
                        background: isLight ? '#FFF' : 'rgba(0,0,0,0.25)',
                        color: colors.text,
                        padding: '0.65rem 0.75rem',
                        fontWeight: 800,
                        fontSize: '0.98rem',
                        lineHeight: 1.4,
                        resize: 'vertical'
                      }}
                    />
                    <div style={{
                      marginTop: 8,
                      fontSize: '0.84rem',
                      color: needsProperty ? '#FBBF24' : colors.accent,
                      fontWeight: 800
                    }}>
                      {bubble.task_data?.resolved
                        ? [
                          bubble.task_data?.thai_sign,
                          bubble.task_data?.unit_name || bubble.task_data?.sign_he,
                          bubble.task_data?.thai_label ? `(${bubble.task_data.thai_label})` : null,
                          bubble.task_data?.property_he ? `· ${bubble.task_data.property_he}` : null
                        ].filter(Boolean).join(' ')
                        : (bubble.task_data?.unit_number != null
                          ? `בקתה ${bubble.task_data.unit_number} · חסר מתחם`
                          : 'חסר מתחם / יחידה')}
                    </div>
                    {bubble.clarifyHint || needsProperty ? (
                      <div style={{
                        marginTop: 8,
                        fontSize: '0.78rem',
                        fontWeight: 800,
                        color: '#FBBF24',
                        lineHeight: 1.35
                      }}>
                        {bubble.clarifyHint || 'בחרו מתחם מהרשימה אצלנו — בלי זה אי אפשר להוסיף ללוח'}
                      </div>
                    ) : null}
                    {needsProperty && candidates.length ? (
                      <div style={{
                        marginTop: 10,
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                        gap: 6
                      }}>
                        {candidates.map((prop) => (
                          <button
                            key={prop.id}
                            type="button"
                            onClick={() => pickPropertyForBubble(bubble.id, prop.id)}
                            style={{
                              minHeight: 44,
                              borderRadius: 10,
                              border: '1px solid rgba(245,158,11,0.45)',
                              background: 'rgba(245,158,11,0.12)',
                              color: colors.text,
                              fontWeight: 800,
                              fontSize: '0.78rem',
                              cursor: 'pointer',
                              padding: '6px 8px',
                              textAlign: 'center'
                            }}
                          >
                            {prop.circled || prop.letter ? (
                              <span style={{ marginInlineEnd: 4 }}>{prop.circled || prop.letter}</span>
                            ) : null}
                            {prop.he}
                            {prop.code != null ? (
                              <div style={{ fontSize: '0.65rem', color: colors.muted, marginTop: 2 }}>
                                {prop.circled}{prop.code}{prop.th ? ` · ${prop.th}` : ''}
                              </div>
                            ) : prop.th ? (
                              <div style={{ fontSize: '0.65rem', color: colors.muted, marginTop: 2 }}>{prop.th}</div>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {bubble.task_data?.category || bubble.task_data?.priority === 'urgent' ? (
                      <div style={{ marginTop: 4, fontSize: '0.75rem', color: colors.muted }}>
                        {bubble.task_data.category || ''}
                        {bubble.task_data.priority === 'urgent' ? ' · דחוף' : ''}
                      </div>
                    ) : null}
                    {bubble.task_data?.resolved ? (
                      <FieldNavLinks
                        wazeUrl={bubble.task_data?.wazeUrl}
                        mapsUrl={bubble.task_data?.mapsUrl}
                        propertyLabel={bubble.task_data?.property_he}
                        theme={theme}
                      />
                    ) : null}

                    <TaskPhotoAttach
                      photos={bubble.task_data?.photos || []}
                      colors={colors}
                      isLight={isLight}
                      disabled={bubble.boardStatus === 'saved'}
                      onAddFiles={(files) => addBubblePhotos(bubble.id, files)}
                      onRemove={(index) => removeBubblePhoto(bubble.id, index)}
                    />
                  </div>
                )}
                {!isTask ? (
                  <button
                    type="button"
                    onClick={() => speakText(bubble.translatedText, bubble.targetLang)}
                    style={{
                      marginTop: 10,
                      border: 'none',
                      background: 'rgba(99,102,241,0.14)',
                      color: colors.accent,
                      borderRadius: 999,
                      padding: '6px 10px',
                      fontWeight: 800,
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    <Volume2 size={14} />
                    השמע שוב
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => speakText(bubble.task_data?.task_he || bubble.translatedText, 'he')}
                    style={{
                      marginTop: 10,
                      border: 'none',
                      background: 'rgba(99,102,241,0.14)',
                      color: colors.accent,
                      borderRadius: 999,
                      padding: '6px 10px',
                      fontWeight: 800,
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    <Volume2 size={14} />
                    הקרא נוסח מעודכן
                  </button>
                )}
                {(bubble.is_task || bubble.is_issue || isTask) && bubble.task_data ? (
                  <TaskActionChip
                    bubble={bubble}
                    colors={colors}
                    busy={savingBubbleId === bubble.id || bubble.boardStatus === 'saving'}
                    onAdd={() => addDetectedTask(bubble)}
                  />
                ) : null}
              </div>
            );
          })}
        </div>

        <div style={{ padding: '0.35rem 1rem 0.85rem' }}>
          <LiveHearBar
            hearing={hearing}
            hearState={hearState}
            liveHeard={liveHeard}
            busy={busy}
            colors={colors}
            modeHint={modeHint}
            error={error}
          />

          {isTaskMode ? (
            <PttButton
              label="הכתב משימה"
              sub={`${managerMeta.native} · AI ינסח ללוח`}
              color="#6366F1"
              active={deviceListening || pttSide === 'task'}
              icon={<Mic size={24} />}
              tall
              onPointerDown={(e) => onPressStart('task', e)}
              onPointerUp={(e) => onPressEnd('task', e)}
              onPointerLeave={endPtt}
              onPointerCancel={endPtt}
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <PttButton
                label={managerMeta.native}
                sub={`אני · ${managerMeta.short} → ${workerMeta.short}`}
                color="#2563EB"
                active={deviceListening || pttSide === 'manager'}
                icon={<Mic size={22} />}
                onPointerDown={(e) => onPressStart('manager', e)}
                onPointerUp={(e) => onPressEnd('manager', e)}
                onPointerLeave={endPtt}
                onPointerCancel={endPtt}
              />
              <PttButton
                label={workerMeta.native}
                sub={`צד שני · ${workerMeta.short} → ${managerMeta.short}`}
                color="#059669"
                active={partnerListening || pttSide === 'worker'}
                icon={<Mic size={22} />}
                onPointerDown={(e) => onPressStart('worker', e)}
                onPointerUp={(e) => onPressEnd('worker', e)}
                onPointerLeave={endPtt}
                onPointerCancel={endPtt}
              />
            </div>
          )}
        </div>
      </div>

      {toast ? (
        <div style={{
          position: 'fixed',
          left: '50%',
          bottom: 'calc(1.2rem + env(safe-area-inset-bottom))',
          transform: 'translateX(-50%)',
          zIndex: 70,
          background: '#059669',
          color: '#FFF',
          borderRadius: 999,
          padding: '0.65rem 1rem',
          fontWeight: 800,
          fontSize: '0.85rem',
          boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
          whiteSpace: 'nowrap'
        }}>
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function LiveHearBar({ hearing, hearState, liveHeard, busy, colors, modeHint, error }) {
  const statusLabel = busy || hearState === 'translating'
    ? 'AI מעבד…'
    : hearState === 'understood'
      ? 'הבנתי ✓'
      : hearing
        ? 'מקשיב…'
        : modeHint;

  return (
    <div style={{
      marginBottom: 10,
      borderRadius: 14,
      border: `1px solid ${hearing ? 'rgba(99,102,241,0.45)' : colors.line}`,
      background: hearing ? 'rgba(99,102,241,0.12)' : (colors.line === 'rgba(255,255,255,0.1)' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'),
      padding: '0.7rem 0.8rem',
      minHeight: 64
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6
      }}>
        <span style={{
          width: 10,
          height: 10,
          borderRadius: 999,
          background: hearing ? '#6366F1' : colors.muted,
          boxShadow: hearing ? '0 0 0 6px rgba(99,102,241,0.25)' : 'none',
          animation: hearing ? 'pulse 1.1s ease infinite' : 'none'
        }}
        />
        <Radio size={14} color={hearing ? '#6366F1' : colors.muted} />
        <span style={{ fontWeight: 900, fontSize: '0.78rem', color: hearing ? '#A5B4FC' : colors.muted }}>
          {statusLabel}
        </span>
        {(busy || hearState === 'translating') ? <Loader2 size={14} color="#6366F1" /> : null}
      </div>
      <div style={{
        fontWeight: 800,
        fontSize: '0.92rem',
        lineHeight: 1.35,
        color: liveHeard ? colors.text : colors.muted,
        minHeight: '1.35em'
      }}>
        {liveHeard || (error ? error : 'כאן יופיע מה שנשמע בזמן אמת')}
      </div>
    </div>
  );
}

function TaskPhotoAttach({ photos, colors, isLight, disabled, onAddFiles, onRemove }) {
  const inputRef = useRef(null);
  const list = Array.isArray(photos) ? photos : [];

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        marginBottom: 8
      }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: colors.muted }}>
          תמונה למשימה (אופציונלי)
        </span>
        <button
          type="button"
          disabled={disabled || list.length >= MAX_TASK_PHOTOS}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `1px solid ${colors.line}`,
            background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)',
            color: colors.text,
            borderRadius: 999,
            padding: '6px 10px',
            fontWeight: 800,
            fontSize: '0.72rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled || list.length >= MAX_TASK_PHOTOS ? 0.55 : 1
          }}
        >
          <Camera size={14} />
          הוסף תמונה
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          style={{ display: 'none' }}
          onChange={(event) => {
            onAddFiles(event.target.files);
            event.target.value = '';
          }}
        />
      </div>
      {list.length ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {list.map((src, index) => (
            <div
              key={`${index}_${String(src).slice(-12)}`}
              style={{
                position: 'relative',
                width: 72,
                height: 72,
                borderRadius: 12,
                overflow: 'hidden',
                border: `1px solid ${colors.line}`
              }}
            >
              <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              {!disabled ? (
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  aria-label="הסר תמונה"
                  style={{
                    position: 'absolute',
                    top: 4,
                    insetInlineStart: 4,
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    border: 'none',
                    background: 'rgba(0,0,0,0.65)',
                    color: '#FFF',
                    display: 'grid',
                    placeItems: 'center',
                    cursor: 'pointer',
                    padding: 0
                  }}
                >
                  <X size={12} />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          style={{
            width: '100%',
            minHeight: 52,
            borderRadius: 12,
            border: `1px dashed ${colors.line}`,
            background: 'transparent',
            color: colors.muted,
            fontWeight: 800,
            fontSize: '0.78rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            cursor: disabled ? 'not-allowed' : 'pointer'
          }}
        >
          <ImagePlus size={16} />
          צילום / בחירה מהגלריה
        </button>
      )}
    </div>
  );
}

function TaskActionChip({ bubble, colors, busy, onAdd }) {
  const task = bubble.task_data || {};
  const needsProperty = Boolean(task.needs_property && !task.resolved);
  const where = task.resolved
    ? (task.unit_name || task.sign_he || '')
    : '';
  const unitLabel = where ? ` · ${[task.thai_sign, where].filter(Boolean).join(' ')}` : '';
  const issue = Boolean(bubble.is_issue);
  const saved = bubble.boardStatus === 'saved';
  const failed = bubble.boardStatus === 'error';

  if (saved) {
    return (
      <div style={{
        marginTop: 10,
        borderRadius: 12,
        background: 'rgba(16,185,129,0.16)',
        border: '1px solid rgba(16,185,129,0.35)',
        color: '#34D399',
        padding: '0.55rem 0.7rem',
        fontWeight: 800,
        fontSize: '0.78rem'
      }}>
        נוספה ללוח המשימות ✓
      </div>
    );
  }

  if (needsProperty) {
    return (
      <div style={{
        marginTop: 10,
        borderRadius: 12,
        background: 'rgba(245,158,11,0.12)',
        border: '1px solid rgba(245,158,11,0.4)',
        color: '#FBBF24',
        padding: '0.6rem 0.75rem',
        fontWeight: 800,
        fontSize: '0.78rem',
        lineHeight: 1.35
      }}>
        ממתינים לבחירת מתחם מהרשימה למעלה — רק אז אפשר לפתוח קריאה
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={busy || !task.resolved}
      style={{
        marginTop: 10,
        width: '100%',
        textAlign: 'right',
        borderRadius: 12,
        border: `1px solid ${issue ? 'rgba(245,158,11,0.45)' : 'rgba(99,102,241,0.45)'}`,
        background: issue ? 'rgba(245,158,11,0.12)' : 'rgba(99,102,241,0.12)',
        color: colors.text,
        padding: '0.65rem 0.75rem',
        cursor: busy || !task.resolved ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        opacity: busy || !task.resolved ? 0.65 : 1
      }}
    >
      <span style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0, flex: 1 }}>
        {issue ? <AlertTriangle size={16} color="#F59E0B" /> : <Zap size={16} color="#6366F1" />}
        <span style={{ fontWeight: 800, fontSize: '0.78rem', lineHeight: 1.35 }}>
          {issue ? 'דווחה תקלה' : 'זוהתה משימה'}
          {unitLabel}
          {`: "${task.task_he || bubble.sourceText}"`}
          {failed ? ' · נכשל, נסו שוב' : ''}
        </span>
      </span>
      <span style={{
        flex: '0 0 auto',
        borderRadius: 999,
        background: issue ? '#D97706' : '#6366F1',
        color: '#FFF',
        fontWeight: 900,
        fontSize: '0.72rem',
        padding: '6px 10px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6
      }}>
        {busy ? <Loader2 size={14} /> : null}
        {busy ? 'שומר…' : (issue ? '+ פתח קריאה' : '+ הוסף ללוח')}
      </span>
    </button>
  );
}

function PttButton({
  label,
  sub,
  color,
  active,
  icon,
  tall,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  onPointerCancel
}) {
  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerCancel}
      onContextMenu={(event) => event.preventDefault()}
      style={{
        width: '100%',
        minHeight: tall ? 120 : 108,
        borderRadius: 18,
        border: active ? `2px solid ${color}` : '2px solid transparent',
        background: active
          ? `linear-gradient(160deg, ${color}, ${color}CC)`
          : `linear-gradient(160deg, ${color}F2, ${color})`,
        color: '#FFF',
        boxShadow: active
          ? `0 0 0 4px ${color}44, 0 12px 28px ${color}55`
          : `0 10px 24px ${color}44`,
        cursor: 'pointer',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '0.7rem 0.5rem',
        transform: active ? 'scale(0.98)' : 'none',
        transition: 'transform 80ms ease, box-shadow 120ms ease'
      }}
    >
      {icon}
      <span style={{ fontWeight: 900, fontSize: '0.95rem', lineHeight: 1.2, textAlign: 'center' }}>
        {label}
      </span>
      <span style={{ fontWeight: 700, fontSize: '0.68rem', opacity: 0.9 }}>{sub}</span>
    </button>
  );
}

export { BCP47 };
