import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Send, Sparkles, Mic, MicOff, RefreshCw, Bot, User, 
  RotateCcw, ShieldCheck, CheckCircle2 
} from 'lucide-react';
import { ReservationCards } from './ReservationCards';
import { ConfirmationCard } from './ConfirmationCard';
import { UnitStatusCards } from './UnitStatusCards';

class WidgetErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err, info) {
    console.error('[CHLOE WIDGET ERROR]', err, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          marginTop: '0.5rem',
          padding: '0.65rem 0.85rem',
          borderRadius: '10px',
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.25)',
          fontSize: '0.76rem',
          color: '#DC2626',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span>חלה שגיאה בטעינת הכרטיסייה.</span>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            style={{
              background: '#DC2626',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              padding: '0.2rem 0.5rem',
              fontSize: '0.7rem',
              cursor: 'pointer',
              fontWeight: 800
            }}
          >
            נסה שוב
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const INITIAL_MESSAGES = [
  {
    id: 'chloe-welcome',
    sender: 'chloe',
    text: 'שלום מקס! אני כאן איתך בניהול הריזורט ✨\nנתוני האמת של היום מסונכרנים ישירות מהמערכת. תוכל לשאול אותי בחופשיות או לבחור באחת מפעולות המפתח למעלה:',
    timestamp: 'כרגע',
    widget: null
  }
];

const QUICK_PILLS = [
  { id: 'arrivals', label: '🚪 כניסות היום', prompt: 'תראי לי את הכניסות להיום' },
  { id: 'unpaid', label: '💳 מי עוד לא שילם?', prompt: 'מי מהם עוד לא שילם?' },
  { id: 'cleaning', label: '🧹 מה לניקיון?', prompt: 'אילו יחידות ממתינות לניקיון כרגע?' },
  { id: 'send_sms', label: '💬 הודעה לנכנסים', prompt: 'תשלחי הודעת ווטסאפ קבלת פנים לאורחים' }
];

export default function ChloeDashboardChat({ sessionUser, theme = 'light', chrome = 'resort' }) {
  const isDark = theme === 'dark';
  const priority = chrome === 'priority' && !isDark;
  const pageBg = priority ? '#eaecf0' : (isDark ? '#26130F' : '#FAF8F3');
  const cardBg = priority ? '#f8fafc' : (isDark ? '#1C0F0C' : '#FFFFFF');
  const ink = priority ? '#0f172a' : (isDark ? '#FDFBF7' : '#26130F');
  const accent = priority ? '#1b365d' : (isDark ? '#C5A059' : '#8C6B28');
  const line = priority ? '#94a3b8' : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(197, 160, 89, 0.22)');
  const font = priority ? 'Tahoma, "Segoe UI", Arial, sans-serif' : 'Heebo, Assistant, system-ui, sans-serif';
  const [messages, setMessages] = useState(() => {
    try {
      const saved = sessionStorage.getItem('chloe_dashboard_messages_v1');
      if (saved) return JSON.parse(saved);
      return INITIAL_MESSAGES;
    } catch {
      return INITIAL_MESSAGES;
    }
  });

  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isExecutingAction, setIsExecutingAction] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);

  // Auto-scroll to bottom of messages
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
    try {
      sessionStorage.setItem('chloe_dashboard_messages_v1', JSON.stringify(messages));
    } catch {}
  }, [messages, isTyping, scrollToBottom]);

  // Handle Speech-to-Text in Hebrew (Web Speech API)
  const toggleListening = () => {
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      alert('זיהוי קולי אינו נתמך בדפדפן זה. מומלץ להשתמש ב-Safari או Chrome.');
      return;
    }

    try {
      const recognition = new SpeechRec();
      recognition.lang = 'he-IL';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event) => {
        const transcript = event.results[0]?.[0]?.transcript || '';
        if (transcript) {
          setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      setIsListening(false);
    }
  };

  // Send message to Backend Gateway
  const handleSendMessage = async (textToSend = null, actionConfirmed = null) => {
    const text = (textToSend !== null ? textToSend : input).trim();
    if (!text && !actionConfirmed) return;

    if (!actionConfirmed) {
      setInput('');
      const userMsg = {
        id: `u-${Date.now()}`,
        sender: 'user',
        text,
        timestamp: new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit' }).format(new Date())
      };
      setMessages((prev) => [...prev, userMsg]);
    }

    setIsTyping(true);

    try {
      const token = localStorage.getItem('resortos_dashboard_token_v1') || 'dev-local-token';
      const res = await fetch('/api/chloe/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          message: text,
          actionConfirmed: actionConfirmed || null
        })
      });

      const data = await res.json();

      const chloeMsg = {
        id: `c-${Date.now()}`,
        sender: 'chloe',
        text: data?.reply || 'אני כאן איתך, איך עוד אוכל לעזור בריזורט?',
        timestamp: new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit' }).format(new Date()),
        widget: data?.widget || null
      };

      setMessages((prev) => [...prev, chloeMsg]);
    } catch (err) {
      const errorMsg = {
        id: `c-err-${Date.now()}`,
        sender: 'chloe',
        text: 'חלה בעיה קלה בתקשורת עם השרת, אך נתוני הריזורט שמורים ומאובטחים. נסה שוב בעוד רגע.',
        timestamp: 'כרגע',
        widget: null
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
      setIsExecutingAction(false);
    }
  };

  // Confirm proposed action
  const handleConfirmAction = async (actionData) => {
    setIsExecutingAction(true);
    await handleSendMessage(null, actionData);
  };

  // Cancel proposed action
  const handleCancelAction = () => {
    setMessages((prev) => [
      ...prev,
      {
        id: `c-cancel-${Date.now()}`,
        sender: 'chloe',
        text: 'הפעולה בוטלה לבקשתך. לא בוצע שום שינוי במערכת. 👍',
        timestamp: 'כרגע'
      }
    ]);
  };

  const handleResetChat = () => {
    setMessages(INITIAL_MESSAGES);
    try {
      sessionStorage.removeItem('chloe_dashboard_messages_v1');
    } catch {}
  };

  return (
    <div 
      className="dashboard-chloe"
      dir="rtl"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        flex: 1,
        maxHeight: '100%',
        background: pageBg,
        color: ink,
        fontFamily: font,
        fontSize: priority ? '13px' : undefined,
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Top Sticky Bar: Live Status + Quick Pills */}
      <div style={{
        background: cardBg,
        borderBottom: `1px solid ${line}`,
        padding: priority ? '6px 8px' : '0.5rem 0.75rem 0.6rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.45rem',
        boxShadow: isDark ? '0 4px 12px rgba(0,0,0,0.3)' : '0 2px 8px rgba(38, 19, 15, 0.04)',
        zIndex: 10
      }}>
        {/* Status Line */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#10B981',
              boxShadow: priority ? 'none' : '0 0 8px #10B981',
              flex: '0 0 auto'
            }} />
            <span style={{ fontSize: priority ? '12px' : '0.74rem', fontWeight: 800, color: ink, whiteSpace: 'nowrap' }}>
              קלואי מחוברת
            </span>
            {priority ? null : (
              <span style={{ fontSize: '0.68rem', color: accent, fontWeight: 700 }}>
                · Mac Studio AI (Chloe-Host)
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleResetChat}
            title="איפוס שיחה"
            style={{
              background: 'none',
              border: 'none',
              color: priority ? '#334155' : (isDark ? '#A89487' : '#8C6B28'),
              fontSize: '0.7rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem'
            }}
          >
            <RotateCcw size={12} />
            <span>איפוס</span>
          </button>
        </div>

        {/* Quick Pills Bar (Horizontal Touch Scroll) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: priority ? 'wrap' : 'nowrap',
          gap: '6px',
          overflowX: priority ? 'visible' : 'auto',
          paddingBottom: '2px',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none'
        }}>
          {QUICK_PILLS.map((pill) => (
            <button
              key={pill.id}
              type="button"
              onClick={() => handleSendMessage(pill.prompt)}
              style={{
                whiteSpace: 'nowrap',
                background: priority ? '#f8fafc' : (isDark ? 'rgba(197, 160, 89, 0.15)' : '#FAF8F3'),
                border: priority ? '1px solid #94a3b8' : (isDark ? '1px solid rgba(197, 160, 89, 0.35)' : '1px solid rgba(197, 160, 89, 0.32)'),
                color: accent,
                borderRadius: priority ? '2px' : '999px',
                padding: '0.3rem 0.65rem',
                fontSize: priority ? '12px' : '0.73rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                boxShadow: '0 1px 4px rgba(0,0,0,0.03)'
              }}
            >
              <span>{pill.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Messages Stream Area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '0.85rem 0.75rem 5.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.9rem',
        WebkitOverflowScrolling: 'touch'
      }}>
        {messages.map((msg) => {
          const isChloe = msg.sender === 'chloe';

          return (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: isChloe ? 'flex-start' : 'flex-end',
                maxWidth: '100%',
                width: '100%'
              }}
            >
              {/* Message Bubble Card */}
              <div
                style={{
                  maxWidth: isChloe ? '96%' : '85%',
                  background: isChloe 
                    ? (priority ? '#f8fafc' : (isDark ? '#311813' : '#FFFFFF'))
                    : (priority ? '#1b365d' : 'linear-gradient(135deg, #C5A059, #A07C36)'),
                  color: isChloe 
                    ? ink
                    : '#FFFFFF',
                  border: isChloe 
                    ? (priority ? '1px solid #94a3b8' : (isDark ? '1px solid rgba(197, 160, 89, 0.25)' : '1px solid rgba(197, 160, 89, 0.25)'))
                    : 'none',
                  borderRadius: priority ? '2px' : (isChloe ? '16px 16px 16px 4px' : '16px 16px 4px 16px'),
                  padding: priority ? '8px 10px' : '0.75rem 0.9rem',
                  boxShadow: priority ? 'none' : (isChloe 
                    ? (isDark ? '0 4px 14px rgba(0,0,0,0.4)' : '0 3px 12px rgba(38, 19, 15, 0.06)') 
                    : '0 4px 14px rgba(197, 160, 89, 0.3)'),
                  fontSize: priority ? '13px' : '0.86rem',
                  lineHeight: 1.5,
                  wordBreak: 'break-word',
                  position: 'relative'
                }}
              >
                {/* Chloe Header Badge inside bubble */}
                {isChloe && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    marginBottom: '0.35rem',
                    fontSize: '0.72rem',
                    fontWeight: 900,
                    color: accent
                  }}>
                    <Sparkles size={13} color={accent} />
                    <span>קלואי (ResortOS AI)</span>
                  </div>
                )}

                {/* Text Body with natural line breaks */}
                <div style={{ whiteSpace: 'pre-wrap' }}>
                  {msg.text}
                </div>

                {/* Generative UI Widgets */}
                {msg.widget && msg.widget.type === 'ReservationCards' && (
                  <WidgetErrorBoundary>
                    <ReservationCards data={msg.widget.data} />
                  </WidgetErrorBoundary>
                )}

                {msg.widget && msg.widget.type === 'UnitStatusCards' && (
                  <WidgetErrorBoundary>
                    <UnitStatusCards data={msg.widget.data} />
                  </WidgetErrorBoundary>
                )}

                {msg.widget && msg.widget.type === 'ConfirmationCard' && (
                  <WidgetErrorBoundary>
                    <ConfirmationCard 
                      data={msg.widget.data} 
                      onConfirm={handleConfirmAction}
                      onCancel={handleCancelAction}
                      isExecuting={isExecutingAction}
                    />
                  </WidgetErrorBoundary>
                )}

                {/* Timestamp */}
                <div style={{
                  fontSize: '0.62rem',
                  color: isChloe ? (isDark ? '#A89487' : '#9E897C') : 'rgba(255, 255, 255, 0.75)',
                  textAlign: isChloe ? 'left' : 'right',
                  marginTop: '0.4rem',
                  fontWeight: 600
                }}>
                  {msg.timestamp}
                </div>
              </div>
            </div>
          );
        })}

        {/* Typing Indicator */}
        {isTyping && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingInline: '0.4rem' }}>
            <div style={{
              background: priority ? '#f8fafc' : (isDark ? '#311813' : '#FFFFFF'),
              border: priority ? '1px solid #94a3b8' : (isDark ? '1px solid rgba(197, 160, 89, 0.25)' : '1px solid rgba(197, 160, 89, 0.25)'),
              borderRadius: priority ? '2px' : '16px 16px 16px 4px',
              padding: '0.55rem 0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: priority ? '12px' : '0.76rem',
              color: priority ? '#1b365d' : (isDark ? '#C5A059' : '#8C6B28'),
              fontWeight: 800,
              boxShadow: priority ? 'none' : '0 2px 8px rgba(0,0,0,0.05)'
            }}>
              <RefreshCw size={13} className="animate-spin" />
              <span>קלואי מסנכרנת נתונים...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Bottom Sticky Input Bar */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        background: cardBg,
        borderTop: `1px solid ${line}`,
        padding: priority ? '6px 8px' : '0.6rem 0.75rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.45rem',
        boxShadow: isDark ? '0 -4px 16px rgba(0,0,0,0.35)' : '0 -2px 10px rgba(38, 19, 15, 0.05)',
        zIndex: 20
      }}>
        {/* Voice Microphone Button */}
        <button
          type="button"
          onClick={toggleListening}
          title={isListening ? 'מקשיב... לחץ לסיום' : 'הקלטה קולית בעברית'}
          style={{
            width: priority ? '36px' : '42px',
            height: priority ? '36px' : '42px',
            borderRadius: priority ? '2px' : '50%',
            border: isListening ? '2px solid #EF4444' : (priority ? '1px solid #94a3b8' : (isDark ? '1px solid rgba(197, 160, 89, 0.4)' : '1px solid rgba(197, 160, 89, 0.35)')),
            background: isListening 
              ? '#FEE2E2' 
              : (priority ? '#f8fafc' : (isDark ? 'rgba(197, 160, 89, 0.15)' : '#FAF8F3')),
            color: isListening ? '#DC2626' : (priority ? '#1b365d' : (isDark ? '#F1D699' : '#8C6B28')),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'all 0.2s ease',
            boxShadow: isListening ? '0 0 12px rgba(239, 68, 68, 0.5)' : 'none'
          }}
        >
          {isListening ? <MicOff size={18} className="animate-pulse" /> : <Mic size={18} />}
        </button>

        {/* Text Input Field */}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage();
            }
          }}
          placeholder={isListening ? 'מקשיבה... דבר עכשיו' : 'שאל את קלואי (למשל: "כניסות היום")...'}
          style={{
            flex: 1,
            minWidth: 0,
            background: priority ? '#ffffff' : (isDark ? '#26130F' : '#FAF8F3'),
            border: priority ? '1px solid #94a3b8' : (isDark ? '1px solid rgba(197, 160, 89, 0.35)' : '1px solid rgba(197, 160, 89, 0.35)'),
            borderRadius: priority ? '2px' : '999px',
            padding: priority ? '8px 10px' : '0.65rem 1rem',
            color: priority ? '#0f172a' : (isDark ? '#FDFBF7' : '#26130F'),
            fontSize: priority ? '13px' : '0.86rem',
            fontFamily: font,
            fontWeight: 600,
            outline: 'none',
            boxSizing: 'border-box'
          }}
        />

        {/* Send Button */}
        <button
          type="button"
          disabled={!input.trim() || isTyping}
          onClick={() => handleSendMessage()}
          style={{
            width: priority ? '36px' : '42px',
            height: priority ? '36px' : '42px',
            borderRadius: priority ? '2px' : '50%',
            background: input.trim() && !isTyping 
              ? (priority ? '#1b365d' : 'linear-gradient(135deg, #C5A059, #9E7D3B)')
              : (priority ? '#e2e8f0' : (isDark ? 'rgba(255, 255, 255, 0.08)' : '#F2EEE6')),
            color: input.trim() && !isTyping ? '#FFFFFF' : (priority ? '#64748b' : '#9E897C'),
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: input.trim() && !isTyping ? 'pointer' : 'default',
            flexShrink: 0,
            boxShadow: input.trim() && !isTyping ? '0 4px 12px rgba(197, 160, 89, 0.35)' : 'none',
            transition: 'all 0.2s ease'
          }}
        >
          <Send size={18} style={{ transform: 'rotate(180deg)' }} />
        </button>
      </div>
    </div>
  );
}
