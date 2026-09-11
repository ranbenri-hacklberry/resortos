import React, { useState } from 'react';
import { Tv, Printer, Sparkles, CheckCircle2, RefreshCw, AlertCircle, Wifi, BookOpen } from 'lucide-react';

export interface ComicStep {
  step: number;
  title: string;
  illustrationUrl: string;
  instructions: string;
  proTip?: string;
}

export interface ComicGuideData {
  id: string;
  slug: string;
  title: string;
  category: string;
  summary: string;
  default_avatar_persona?: string;
  steps: ComicStep[];
}

export interface ComicGuideRendererProps {
  guide: ComicGuideData;
  propertyId: string;
  unitId: string;
  propertyName?: string;
  unitName?: string;
  hostAvatarUrl?: string;
  wifiSsid?: string;
  wifiPassword?: string;
  hostNotes?: string;
  onTvPushSuccess?: (channel: string) => void;
  className?: string;
}

export const ComicGuideRenderer: React.FC<ComicGuideRendererProps> = ({
  guide,
  propertyId,
  unitId,
  propertyName = 'מתחם נופש ResortOS',
  unitName = 'סוויטת אירוח',
  hostAvatarUrl,
  wifiSsid,
  wifiPassword,
  hostNotes,
  onTvPushSuccess,
  className = ''
}) => {
  const [isPushing, setIsPushing] = useState(false);
  const [pushStatus, setPushStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [pushMessage, setPushMessage] = useState<string | null>(null);

  const activeAvatar = hostAvatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80';
  const personaName = hostAvatarUrl ? 'המארח שלכם' : 'רן וקוסטה · צוות ResortOS';

  const handlePushToTv = async () => {
    try {
      setIsPushing(true);
      setPushStatus('idle');
      setPushMessage(null);

      const response = await fetch('/api/tv/push-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: propertyId,
          unit_id: unitId,
          guide_id: guide.id,
          custom_wifi_name: wifiSsid,
          custom_wifi_password: wifiPassword,
          custom_notes: hostNotes,
          avatar_override_url: hostAvatarUrl
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'שגיאה בשידור המדריך');
      }

      setPushStatus('success');
      setPushMessage(data.message || 'המדריך שודר בהצלחה לטלוויזיית החדר!');
      onTvPushSuccess?.(data.channel);

      setTimeout(() => {
        setPushStatus('idle');
        setPushMessage(null);
      }, 4000);
    } catch (err: any) {
      setPushStatus('error');
      setPushMessage(err?.message || 'לא ניתן לשדר כעת. נסו שוב.');
    } finally {
      setIsPushing(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className={`printable-comic-guide max-w-4xl mx-auto ${className}`}>
      {/* Embedded Print Stylesheet for Strict 1-Page A4 Layout */}
      <style>{`
        @page {
          size: A4 portrait;
          margin: 6mm 8mm 6mm 8mm;
        }
        @media print {
          html, body {
            background: #ffffff !important;
            color: #1a1a1a !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            font-size: 11pt;
            width: 100% !important;
            height: auto !important;
          }
          header, nav, footer, .no-print, [role="navigation"] {
            display: none !important;
          }
          main {
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
          }
          .printable-comic-guide {
            max-width: 100% !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
          .guide-main-container {
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }
          .print-header-block {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            border-bottom: 1.5px solid #26130F !important;
            padding-bottom: 6px !important;
            margin-bottom: 6px !important;
          }
          .comic-grid {
            display: grid !important;
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 8px !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .comic-step-card {
            border: 1px solid #D4C9BE !important;
            box-shadow: none !important;
            background: #FFFFFF !important;
            padding: 7px 9px !important;
            border-radius: 8px !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
          }
          .comic-step-img-box {
            height: 112px !important;
            max-height: 112px !important;
            border-radius: 6px !important;
            overflow: hidden !important;
            margin-bottom: 5px !important;
            border: 1px solid #E5E0D8 !important;
          }
          .comic-step-img {
            width: 100% !important;
            height: 100% !important;
            max-height: 112px !important;
            object-fit: cover !important;
            object-position: center !important;
            display: block !important;
          }
          .comic-step-title {
            font-size: 10pt !important;
            line-height: 1.2 !important;
            font-weight: 800 !important;
            color: #26130F !important;
            margin-bottom: 2px !important;
          }
          .comic-step-desc {
            font-size: 8pt !important;
            line-height: 1.3 !important;
            color: #4A4036 !important;
          }
          .comic-step-tip {
            background: #FAF6F0 !important;
            border: 1px solid #EADBCE !important;
            border-radius: 4px !important;
            padding: 3px 6px !important;
            font-size: 7.5pt !important;
            line-height: 1.25 !important;
            color: #6B4E2B !important;
            margin-top: 4px !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print-wifi-container {
            margin: 4px 0 8px 0 !important;
            padding: 5px 10px !important;
            border-radius: 6px !important;
            background: #FDFBF7 !important;
            border: 1px solid #EADBCE !important;
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
          }
          .print-footer-container {
            margin-top: 6px !important;
            padding-top: 4px !important;
            border-top: 1px solid #E5E0D8 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            font-size: 7.5pt !important;
            color: #888888 !important;
          }
        }
      `}</style>

      {/* Main Guide Container */}
      <div className="guide-main-container bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-sm overflow-hidden">
        {/* Dedicated Clean Header for Print (Hidden on Screen) */}
        <div className="hidden print-header-block">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-bold text-[#8C6239] bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                מדריך אירוח לאורח
              </span>
              <span className="text-xs font-bold text-stone-600">· {propertyName} ({unitName})</span>
            </div>
            <h1 className="text-lg font-black text-[#26130F]">{guide.title}</h1>
            <p className="text-[9pt] text-stone-600 leading-tight">{guide.summary}</p>
          </div>
          <div className="text-left font-black text-[#26130F] text-sm tracking-tight border-r pr-3 border-stone-300">
            ResortOS<span className="text-[#C5A880] block text-[8pt] font-normal">Guest Playbook</span>
          </div>
        </div>

        {/* Action Header for Screen (Hidden in Print) */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-stone-200 no-print">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[11px] font-bold text-[#8C6239] bg-amber-50 px-2.5 py-0.5 rounded-md border border-amber-200/60 flex items-center gap-1">
                <BookOpen className="w-3 h-3 text-[#C5A880]" />
                <span>מדריך אירוח רשמי</span>
              </span>
              <span className="text-xs text-stone-500 font-medium">· {propertyName} ({unitName})</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-[#26130F]">{guide.title}</h2>
            <p className="text-xs sm:text-sm text-stone-500 max-w-lg mt-0.5 leading-relaxed">{guide.summary}</p>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={handlePushToTv}
              disabled={isPushing}
              className="flex-1 sm:flex-none py-2.5 px-4 rounded-xl bg-[#26130F] hover:bg-[#3F2C29] text-white text-xs font-bold flex items-center justify-center gap-2 shadow transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
            >
              {isPushing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-[#C5A880]" />
                  <span>משדר לחדר...</span>
                </>
              ) : (
                <>
                  <Tv className="w-4 h-4 text-[#C5A880]" />
                  <span>שדר לטלוויזיה</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="py-2.5 px-3.5 rounded-xl border border-stone-300 hover:bg-stone-50 text-stone-700 text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Printer className="w-4 h-4 text-stone-600" />
              <span>הדפס A4 (דף אחד)</span>
            </button>
          </div>
        </div>

        {/* Real-time Broadcast Status Alert */}
        {pushStatus === 'success' && (
          <div className="mt-4 p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2 animate-fadeIn no-print">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{pushMessage}</span>
          </div>
        )}

        {pushStatus === 'error' && (
          <div className="mt-4 p-3 bg-red-50 rounded-xl border border-red-200 text-red-900 text-xs font-bold flex items-center gap-2 animate-fadeIn no-print">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{pushMessage}</span>
          </div>
        )}

        {/* Room & WiFi Header */}
        {(wifiSsid || hostNotes) && (
          <div className="print-wifi-container my-5 p-4 rounded-2xl bg-stone-50 border border-stone-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            {wifiSsid && (
              <div className="flex items-center gap-2.5 text-xs text-stone-700">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-white border border-stone-200 flex items-center justify-center text-[#8C6239] shrink-0">
                  <Wifi className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </div>
                <div>
                  <div className="font-bold text-stone-900 text-[11px] sm:text-xs">רשת Wi-Fi בחדר:</div>
                  <div className="text-[10px] sm:text-xs">
                    רשת: <strong className="font-mono">{wifiSsid}</strong> | סיסמה: <strong className="font-mono">{wifiPassword || 'ללא'}</strong>
                  </div>
                </div>
              </div>
            )}

            {hostNotes && (
              <div className="text-[10px] sm:text-xs text-stone-600 italic bg-white p-2 rounded-xl border border-stone-200 flex-1 sm:max-w-xs">
                "{hostNotes}"
              </div>
            )}
          </div>
        )}

        {/* Comic Step Frames Grid */}
        <div className="comic-grid grid grid-cols-1 md:grid-cols-2 gap-5 pt-3">
          {guide.steps.map((step, idx) => (
            <div
              key={idx}
              className="comic-step-card bg-[#FDFBF7] rounded-2xl p-4 sm:p-5 border border-[#E8DED8] relative flex flex-col justify-between overflow-hidden shadow-sm"
            >
              <div>
                {/* Step Number Badge */}
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <span className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-[#C5A880] text-[#26130F] font-black text-xs flex items-center justify-center shadow-sm">
                    {idx + 1}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider font-bold text-stone-400">
                    שלב {idx + 1} מתוך {guide.steps.length}
                  </span>
                </div>

                {/* Illustration Frame */}
                <div className="comic-step-img-box h-44 sm:h-48 rounded-xl bg-stone-100 overflow-hidden mb-3 border border-stone-200/80 flex items-center justify-center">
                  <img
                    src={step.illustrationUrl}
                    alt={`שלב ${idx + 1}: ${step.title}`}
                    className="comic-step-img w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                    loading="lazy"
                  />
                </div>

                {/* Step Content */}
                <div className="space-y-1">
                  <h4 className="comic-step-title font-bold text-sm sm:text-base text-[#26130F]">{step.title}</h4>
                  <p className="comic-step-desc text-xs text-stone-600 leading-relaxed">{step.instructions}</p>
                </div>
              </div>

              {/* Host Pro-Tip Callout */}
              {step.proTip && (
                <div className="comic-step-tip mt-3 p-2.5 bg-amber-50/90 rounded-xl border border-amber-200/70 text-[11px] text-amber-950 flex items-start gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                  <span>
                    <strong className="font-bold">טיפ מהמארח:</strong> {step.proTip}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer info for print */}
        <div className="print-footer-container mt-6 pt-3 border-t border-stone-200 flex items-center justify-between text-[10px] text-stone-400">
          <span>{propertyName} · מופעל ע״י ResortOS מערכת ניהול חכמה</span>
          <span>לסיוע ושאלות פנו למארח או לקבלה</span>
        </div>
      </div>
    </div>
  );
};
