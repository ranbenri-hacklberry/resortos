import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Send, Sparkles, Mic, MicOff, RefreshCw, Bot, User, 
  RotateCcw, ShieldCheck, CheckCircle2 
} from 'lucide-react';
import { ReservationCards } from './ReservationCards';
import { ConfirmationCard } from './ConfirmationCard';

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

export default function ChloeDashboardChat({ sessionUser, theme = 'light' }) {
  const isDark = theme === 'dark';
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
      dir="rtl"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100dvh - 110px)',
        maxHeight: '100%',
        background: isDark ? '#26130F' : '#FAF8F3',
        color: isDark ? '#FDFBF7' : '#26130F',
        fontFamily: 'Heebo, Assistant, system-ui, sans-serif',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Top Sticky Bar: Live Status + Quick Pills */}
      <div style={{
        background: isDark ? '#1C0F0C' : '#FFFFFF',
        borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(197, 160, 89, 0.22)',
        padding: '0.5rem 0.75rem 0.6rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.45rem',
        boxShadow: isDark ? '0 4px 12px rgba(0,0,0,0.3)' : '0 2px 8px rgba(38, 19, 15, 0.04)',
        zIndex: 10
      }}>
        {/* Status Line */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#10B981',
              boxShadow: '0 0 8px #10B981'
            }} />
            <span style={{ fontSize: '0.74rem', fontWeight: 800, color: isDark ? '#FDFBF7' : '#26130F' }}>
              קלואי מחוברת
            </span>
            <span style={{ fontSize: '0.68rem', color: isDark ? '#C5A059' : '#8C6B28', fontWeight: 700 }}>
              · Mac Studio AI (Chloe-Host)
            </span>
          </div>

          <button
            type="button"
            onClick={handleResetChat}
            title="איפוס שיחה"
            style={{
              background: 'none',
              border: 'none',
              color: isDark ? '#A89487' : '#8C6B28',
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
          gap: '0.35rem',
          overflowX: 'auto',
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
                background: isDark ? 'rgba(197, 160, 89, 0.15)' : '#FAF8F3',
                border: isDark ? '1px solid rgba(197, 160, 89, 0.35)' : '1px solid rgba(197, 160, 89, 0.32)',
                color: isDark ? '#F1D699' : '#8C6B28',
                borderRadius: '999px',
                padding: '0.3rem 0.65rem',
                fontSize: '0.73rem',
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
                    ? (isDark ? '#311813' : '#FFFFFF') 
                    : 'linear-gradient(135deg, #C5A059, #A07C36)',
                  color: isChloe 
                    ? (isDark ? '#FDFBF7' : '#26130F') 
                    : '#FFFFFF',
                  border: isChloe 
                    ? (isDark ? '1px solid rgba(197, 160, 89, 0.25)' : '1px solid rgba(197, 160, 89, 0.25)') 
                    : 'none',
                  borderRadius: isChloe ? '16px 16px 16px 4px' : '16px 16px 4px 16px',
                  padding: '0.75rem 0.9rem',
                  boxShadow: isChloe 
                    ? (isDark ? '0 4px 14px rgba(0,0,0,0.4)' : '0 3px 12px rgba(38, 19, 15, 0.06)') 
                    : '0 4px 14px rgba(197, 160, 89, 0.3)',
                  fontSize: '0.86rem',
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
                    color: '#C5A059'
                  }}>
                    <Sparkles size={13} color="#C5A059" />
                    <span>קלואי (ResortOS AI)</span>
                  </div>
                )}

                {/* Text Body with natural line breaks */}
                <div style={{ whiteSpace: 'pre-wrap' }}>
                  {msg.text}
                </div>

                {/* Generative UI Widgets */}
                {msg.widget && msg.widget.type === 'ReservationCards' && (
                  <ReservationCards data={msg.widget.data} />
                )}

                {msg.widget && msg.widget.type === 'ConfirmationCard' && (
                  <ConfirmationCard 
                    data={msg.widget.data} 
                    onConfirm={handleConfirmAction}
                    onCancel={handleCancelAction}
                    isExecuting={isExecutingAction}
                  />
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
              background: isDark ? '#311813' : '#FFFFFF',
              border: isDark ? '1px solid rgba(197, 160, 89, 0.25)' : '1px solid rgba(197, 160, 89, 0.25)',
              borderRadius: '16px 16px 16px 4px',
              padding: '0.55rem 0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.76rem',
              color: isDark ? '#C5A059' : '#8C6B28',
              fontWeight: 800,
              boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
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
        background: isDark ? '#1C0F0C' : '#FFFFFF',
        borderTop: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(197, 160, 89, 0.25)',
        padding: '0.6rem 0.75rem',
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
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            border: isListening ? '2px solid #EF4444' : (isDark ? '1px solid rgba(197, 160, 89, 0.4)' : '1px solid rgba(197, 160, 89, 0.35)'),
            background: isListening 
              ? '#FEE2E2' 
              : (isDark ? 'rgba(197, 160, 89, 0.15)' : '#FAF8F3'),
            color: isListening ? '#DC2626' : (isDark ? '#F1D699' : '#8C6B28'),
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
            background: isDark ? '#26130F' : '#FAF8F3',
            border: isDark ? '1px solid rgba(197, 160, 89, 0.35)' : '1px solid rgba(197, 160, 89, 0.35)',
            borderRadius: '999px',
            padding: '0.65rem 1rem',
            color: isDark ? '#FDFBF7' : '#26130F',
            fontSize: '0.86rem',
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
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            background: input.trim() && !isTyping 
              ? 'linear-gradient(135deg, #C5A059, #9E7D3B)' 
              : (isDark ? 'rgba(255, 255, 255, 0.08)' : '#F2EEE6'),
            color: input.trim() && !isTyping ? '#FFFFFF' : '#9E897C',
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
