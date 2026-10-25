import React, { useState, useEffect } from 'react';
import { MessageSquare, Send, Sparkles, Phone, Clock, FileText, CheckCircle2 } from 'lucide-react';

const BOT_PHONE = '972515262612';
const DISPLAY_PHONE = '051-526-2612';

const UNIT_MAP = {
  k671: { name: 'בתי נורית · בקתה 1', complex: 'בתי נורית', loc: 'מושב רמות', code: 'G1' },
  k673: { name: 'בתי נורית · בקתה 2', complex: 'בתי נורית', loc: 'מושב רמות', code: 'G2' },
  k674: { name: 'בתי נורית · בקתה 3', complex: 'בתי נורית', loc: 'מושב רמות', code: 'G3' },
  k675: { name: 'בתי נורית · בקתה 4', complex: 'בתי נורית', loc: 'מושב רמות', code: 'G4' },
  k676: { name: 'בתי נורית · בקתה 5', complex: 'בתי נורית', loc: 'מושב רמות', code: 'G5' },
  k677: { name: 'בתי נורית · בקתה 6', complex: 'בתי נורית', loc: 'מושב רמות', code: 'G6' },
  k678: { name: 'בתי נורית · בקתה 7', complex: 'בתי נורית', loc: 'מושב רמות', code: 'G7' },
  k679: { name: 'בתי נורית · בקתה 8', complex: 'בתי נורית', loc: 'מושב רמות', code: 'G8' },
  k687: { name: 'טוסקנה · 1', complex: 'בקתות טוסקנה', loc: 'מושב רמות', code: 'A1' },
  k688: { name: 'טוסקנה · 2', complex: 'בקתות טוסקנה', loc: 'מושב רמות', code: 'A2' },
  k689: { name: 'טוסקנה · שאטו', complex: 'בקתות טוסקנה', loc: 'מושב רמות', code: 'A3' },
  k808: { name: "טאג' מאהל · בקתה 1", complex: "טאג' מאהל", loc: 'מושב רמות', code: 'E1' },
  k809: { name: "טאג' מאהל · בקתה 2", complex: "טאג' מאהל", loc: 'מושב רמות', code: 'E2' },
  k810: { name: "טאג' מאהל · בקתה 3", complex: "טאג' מאהל", loc: 'מושב רמות', code: 'E3' },
  k811: { name: "טאג' מאהל · בקתה 4", complex: "טאג' מאהל", loc: 'מושב רמות', code: 'E4' },
  k680: { name: 'מול הנוף · בקתה 1', complex: 'מול הנוף', loc: 'מושב רמות', code: 'F1' },
  k681: { name: 'מול הנוף · בקתה 2', complex: 'מול הנוף', loc: 'מושב רמות', code: 'F2' },
  k682: { name: 'מול הנוף · בקתה 3', complex: 'מול הנוף', loc: 'מושב רמות', code: 'F3' },
  k683: { name: 'מול הנוף · בקתה 4', complex: 'מול הנוף', loc: 'מושב רמות', code: 'F4' },
  k684: { name: 'מול הנוף · בקתה 5', complex: 'מול הנוף', loc: 'מושב רמות', code: 'F5' },
  k685: { name: 'נופים בלבן · בקתה 1', complex: 'נופים בלבן', loc: 'מושב רמות', code: 'B1' },
  k686: { name: 'נופים בלבן · בקתה 2', complex: 'נופים בלבן', loc: 'מושב רמות', code: 'B2' },
  k690: { name: 'חצר מוסיקלית · בקתה 1 (חליל)', complex: 'החצר המוסיקלית', loc: 'מושב רמות', code: 'C1' },
  k691: { name: 'חצר מוסיקלית · בקתה 2 (מיתר)', complex: 'החצר המוסיקלית', loc: 'מושב רמות', code: 'C2' },
  k692: { name: 'חצר מוסיקלית · בקתה 3 (פעמון)', complex: 'החצר המוסיקלית', loc: 'מושב רמות', code: 'C3' },
  k693: { name: 'בקתות מאיה · בקתה 1', complex: 'בקתות מאיה', loc: 'מושב רמות', code: 'D1' },
  k694: { name: 'בקתות מאיה · בקתה 2', complex: 'בקתות מאיה', loc: 'מושב רמות', code: 'D2' },
  k695: { name: 'בקתות מאיה · בקתה 3', complex: 'בקתות מאיה', loc: 'מושב רמות', code: 'D3' },
  'mialis-villa': { name: 'וילה מיאליס ריזורט', complex: 'מיאליס ריזורט', loc: 'נאות גולן', code: 'וילה_מיאליס_ריזורט' },
  'suite-1': { name: 'סוויטה 1 (הירוקה)', complex: 'מיאליס ריזורט', loc: 'נאות גולן', code: 'סוויטה_1_(הירוקה)' },
  'suite-2': { name: 'סוויטה 2 (הורודה)', complex: 'מיאליס ריזורט', loc: 'נאות גולן', code: 'סוויטה_2_(הורודה)' },
  'dome-blue': { name: 'כיפת שמיים כחול', complex: 'כיפת שמיים', loc: 'גבעת יואב', code: 'כיפת_שמיים_כחול' },
  'dome-green': { name: 'כיפת שמיים ירוק', complex: 'כיפת שמיים', loc: 'גבעת יואב', code: 'כיפת_שמיים_ירוק' },
  'dome-red': { name: 'כיפת שמיים אדום', complex: 'כיפת שמיים', loc: 'גבעת יואב', code: 'כיפת_שמיים_אדום' },
  'hill-1': { name: 'צימר בגבעה 1', complex: 'צימר בגבעה', loc: 'גבעת יואב', code: 'צימר_בגבעה_1' },
  'hill-2': { name: 'צימר בגבעה 2', complex: 'צימר בגבעה', loc: 'גבעת יואב', code: 'צימר_בגבעה_2' },
  'hill-3': { name: 'צימר בגבעה 3', complex: 'צימר בגבעה', loc: 'גבעת יואב', code: 'צימר_בגבעה_3' },
  'hill-4': { name: 'צימר בגבעה 4', complex: 'צימר בגבעה', loc: 'גבעת יואב', code: 'צימר_בגבעה_4' },
  k826: { name: 'קאסה נובה · Aura', complex: 'קאסה נובה', loc: 'מושב נוב', code: 'קאסה_נובה_·_Aura' },
  k827: { name: 'קאסה נובה · Bloom', complex: 'קאסה נובה', loc: 'מושב נוב', code: 'קאסה_נובה_·_Bloom' }
};

export default function GuestWhatsappBridge({ unitId }) {
  const unit = UNIT_MAP[unitId] || {
    name: unitId ? `יחידה ${unitId}` : 'בקתת הנופש שלכם',
    complex: 'מיאליס ריזורט',
    loc: 'רמת הגולן',
    code: unitId || 'RESORT'
  };

  const prefilledText = `שלום, שלחו לי בבקשה את הקישור למדריך הדיגיטלי של ${unit.name} START_${unit.code}`;
  const waUrl = `https://wa.me/${BOT_PHONE}?text=${encodeURIComponent(prefilledText)}`;

  const [countdown, setCountdown] = useState(4);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused) return;
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      window.location.href = waUrl;
    }
  }, [countdown, isPaused, waUrl]);

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#F7F4EB',
      color: '#1C1917',
      fontFamily: "'Assistant', -apple-system, BlinkMacSystemFont, sans-serif",
      direction: 'rtl',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px'
    }}>
      <div style={{
        maxWidth: '460px',
        width: '100%',
        background: '#FFFFFF',
        borderRadius: '20px',
        border: '1.5px solid #DCD3C0',
        boxShadow: '0 12px 36px rgba(28, 25, 23, 0.08)',
        padding: '28px 22px',
        textAlign: 'center'
      }}>
        {/* Crown & Brand */}
        <div style={{
          fontSize: '11px',
          fontWeight: 900,
          letterSpacing: '0.22em',
          color: '#8C6D2D',
          textTransform: 'uppercase',
          marginBottom: '6px'
        }}>
          MIALEES RESORT COLLECTION
        </div>

        {/* Welcome Headline */}
        <h1 style={{
          fontSize: '24px',
          fontWeight: 900,
          margin: '0 0 6px',
          color: '#1C1917',
          lineHeight: 1.2
        }}>
          ברוכים הבאים ל{unit.name}! 🌿
        </h1>
        <div style={{
          fontSize: '13px',
          fontWeight: 700,
          color: '#57534E',
          marginBottom: '20px'
        }}>
          {unit.complex} · {unit.loc}
        </div>

        {/* Notice Banner */}
        <div style={{
          background: '#FFFBEB',
          border: '1.5px solid #FDE68A',
          borderRadius: '12px',
          padding: '12px 14px',
          marginBottom: '22px',
          textAlign: 'right'
        }}>
          <div style={{
            fontSize: '14px',
            fontWeight: 800,
            color: '#92400E',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '4px'
          }}>
            <FileText size={18} color="#D97706" />
            <span>דף האורח הדיגיטלי והמדריך המלא שלכם</span>
          </div>
          <p style={{
            fontSize: '12.5px',
            color: '#78350F',
            margin: 0,
            lineHeight: 1.45,
            fontWeight: 600
          }}>
            לקבלת המדריך האישי של הבקתה, קוד הכספת, מדריך הג׳קוזי, המלצות קולינריות ופתיחת שער — לחצו מטה למעבר ישיר לוואטסאפ:
          </p>
        </div>

        {/* Step-by-Step Visual Cards */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          marginBottom: '24px',
          textAlign: 'right'
        }}>
          {/* Step 1 */}
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            background: '#F9FAFB',
            border: '1px solid #E5E7EB',
            borderRadius: '12px',
            padding: '12px 14px'
          }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: '#DCFCE7',
              color: '#166534',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              fontSize: '15px',
              flexShrink: 0
            }}>
              1
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#111827', marginBottom: '2px' }}>
                לוחצים על הכפתור הירוק למטה 👇
              </div>
              <div style={{ fontSize: '12px', color: '#4B5563', lineHeight: 1.35 }}>
                נפתח ישירות צ׳אט וואטסאפ מול שירות האורחים של הריזורט.
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            background: '#F9FAFB',
            border: '1px solid #E5E7EB',
            borderRadius: '12px',
            padding: '12px 14px'
          }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: '#E0F2FE',
              color: '#0369A1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              fontSize: '15px',
              flexShrink: 0
            }}>
              2
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#111827', marginBottom: '2px' }}>
                לוחצים ״שלח״ (Send) בצ׳אט ✉️
              </div>
              <div style={{ fontSize: '12px', color: '#4B5563', lineHeight: 1.35 }}>
                ההודעה לבקשת המדריך כבר מנוסחת ומוכנה עבורכם בתיבת ההודעה.
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            background: '#F9FAFB',
            border: '1px solid #E5E7EB',
            borderRadius: '12px',
            padding: '12px 14px'
          }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: '#FEF3C7',
              color: '#B45309',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              fontSize: '15px',
              flexShrink: 0
            }}>
              3
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#111827', marginBottom: '2px' }}>
                מקבלים את המדריך המלא מיד! ✨
              </div>
              <div style={{ fontSize: '12px', color: '#4B5563', lineHeight: 1.35 }}>
                קוד כספת המפתח, שעות, פתיחת שער והמדריך המלא נשלחים אליכם תוך שנייה.
              </div>
            </div>
          </div>
        </div>

        {/* Main WhatsApp CTA Button */}
        <a
          href={waUrl}
          onClick={() => setIsPaused(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            width: '100%',
            backgroundColor: '#25D366',
            color: '#FFFFFF',
            textDecoration: 'none',
            fontSize: '18px',
            fontWeight: 900,
            padding: '16px 20px',
            borderRadius: '14px',
            boxShadow: '0 6px 20px rgba(37, 211, 102, 0.35)',
            boxSizing: 'border-box',
            marginBottom: '14px',
            transition: 'transform 0.15s ease'
          }}
        >
          <MessageSquare size={24} color="#FFFFFF" />
          <span>פתח בוואטסאפ וקבל את המדריך</span>
        </a>

        {/* Auto Redirect Countdown */}
        <div style={{
          fontSize: '12px',
          fontWeight: 700,
          color: '#57534E',
          marginBottom: '18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px'
        }}>
          <Clock size={14} color="#8C6D2D" />
          {countdown > 0 && !isPaused ? (
            <span>מעביר אותך אוטומטית בעוד <strong>{countdown}</strong> שניות...</span>
          ) : (
            <span>אם לא עברתם אוטומטית, לחצו על הכפתור הירוק למעלה</span>
          )}
        </div>

        {/* Service Phone Footer */}
        <div style={{
          borderTop: '1px solid #E5E7EB',
          paddingTop: '14px',
          fontSize: '12px',
          color: '#6B7280'
        }}>
          צריכים עזרה טלפונית? חייגו אלינו:{' '}
          <a
            href={`tel:${DISPLAY_PHONE}`}
            style={{
              color: '#8C6D2D',
              fontWeight: 900,
              textDecoration: 'none',
              direction: 'ltr',
              display: 'inline-block'
            }}
          >
            {DISPLAY_PHONE}
          </a>
        </div>
      </div>
    </div>
  );
}
