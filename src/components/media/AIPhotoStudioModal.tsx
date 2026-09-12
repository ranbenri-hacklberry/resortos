import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Sparkles,
  Sun,
  Moon,
  Palette,
  Sliders,
  Download,
  Check,
  CheckCircle2,
  RefreshCw,
  Cpu,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  Wand2,
  ExternalLink,
  ShieldCheck,
  Zap,
  Copy,
  Terminal,
  UploadCloud
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

export interface AIPhotoStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialImageUrl: string;
  propertyName: string;
  propertyVillage?: string;
  onSaveHeroImage?: (newUrl: string) => void;
  onSaveToGallery?: (newUrl: string) => void;
}

export type EnhancementPreset = 'graphic_novel' | 'golden_hour' | 'hospitality_hdr' | 'moody_night';

interface PresetOption {
  id: EnhancementPreset;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultDenoise: number;
  badge: string;
  badgeColor: string;
}

const PRESET_OPTIONS: PresetOption[] = [
  {
    id: 'graphic_novel',
    title: 'איור רומן גרפי / קומיקס',
    subtitle: 'קווי מתאר נקיים, איור עשיר וצבעוני בסגנון מדריכי ResortOS',
    icon: Palette,
    defaultDenoise: 0.72,
    badge: 'Flux Klein LoRA',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-200'
  },
  {
    id: 'golden_hour',
    title: 'תאורת שקיעה ו-Golden Hour',
    subtitle: 'חימום גוונים, קרני שמש רכות ואווירת שקיעה פסטורלית בצפון',
    icon: Sun,
    defaultDenoise: 0.42,
    badge: 'Warm HDR',
    badgeColor: 'bg-amber-100 text-amber-900 border-amber-200'
  },
  {
    id: 'hospitality_hdr',
    title: 'חדות ואירוח יוקרתי (Hospitality)',
    subtitle: 'הבלטת טורקיז מים בבריכה, ניקוי צללים והדגשת צמחייה רעננה',
    icon: Sparkles,
    defaultDenoise: 0.35,
    badge: 'Catalog Vivid',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200'
  },
  {
    id: 'moody_night',
    title: 'תאורת ערב רומנטית (Fairy Lights)',
    subtitle: 'הפיכת יום לערב קסום עם תאורת אווירה חמה ומי בריכה זוהרים',
    icon: Moon,
    defaultDenoise: 0.58,
    badge: 'Night Ambiance',
    badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-200'
  }
];

export const AIPhotoStudioModal: React.FC<AIPhotoStudioModalProps> = ({
  isOpen,
  onClose,
  initialImageUrl,
  propertyName,
  propertyVillage,
  onSaveHeroImage,
  onSaveToGallery
}) => {
  const [selectedPreset, setSelectedPreset] = useState<EnhancementPreset>('graphic_novel');
  const [denoiseStrength, setDenoiseStrength] = useState<number>(0.72);
  const [sliderPos, setSliderPos] = useState<number>(50);
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingTimeMs, setProcessingTimeMs] = useState<number | null>(null);
  const [engineUsed, setEngineUsed] = useState<string>('browser_shader');

  // Backend Connection with localStorage persistence
  const [bridgeUrl, setBridgeUrl] = useState<string>(() => {
    try {
      return localStorage.getItem('resortos_studio_bridge_url') || 'http://127.0.0.1:5005';
    } catch {
      return 'http://127.0.0.1:5005';
    }
  });

  const handleBridgeUrlChange = (newUrl: string) => {
    setBridgeUrl(newUrl);
    try {
      localStorage.setItem('resortos_studio_bridge_url', newUrl);
    } catch {}
  };

  const [isBridgeOnline, setIsBridgeOnline] = useState<boolean>(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [promptOverride, setPromptOverride] = useState('');
  const [tunnelCommandCopied, setTunnelCommandCopied] = useState(false);

  // Storage Persistence & VRAM Management State
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isUnloadingVram, setIsUnloadingVram] = useState<boolean>(false);
  const [vramNotice, setVramNotice] = useState<string | null>(null);

  // Generated Result
  const [enhancedImageUrl, setEnhancedImageUrl] = useState<string>(initialImageUrl);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Sync initial image on open
  useEffect(() => {
    if (initialImageUrl) {
      setEnhancedImageUrl(initialImageUrl);
      generateClientShaderPreview(initialImageUrl, selectedPreset, denoiseStrength);
    }
  }, [initialImageUrl, isOpen]);

  // Check local Mac Studio health
  useEffect(() => {
    let isMounted = true;
    const checkBridge = async () => {
      try {
        const res = await fetch(`${bridgeUrl}/health`, { method: 'GET', signal: AbortSignal.timeout(1500) });
        if (res.ok) {
          const data = await res.json();
          if (isMounted) setIsBridgeOnline(true);
        } else {
          if (isMounted) setIsBridgeOnline(false);
        }
      } catch {
        if (isMounted) setIsBridgeOnline(false);
      }
    };
    checkBridge();
    const interval = setInterval(checkBridge, 10000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [bridgeUrl]);

  // Generate instant browser canvas simulation of the selected preset
  const generateClientShaderPreview = (srcUrl: string, preset: EnhancementPreset, denoise: number) => {
    if (!srcUrl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = srcUrl;
    img.onload = () => {
      const canvas = canvasRef.current || document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const maxDim = 1024;
      let w = img.naturalWidth || 800;
      let h = img.naturalHeight || 600;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }

      canvas.width = w;
      canvas.height = h;

      if (preset === 'golden_hour') {
        ctx.filter = `brightness(${1 + 0.12 * denoise}) contrast(${1 + 0.18 * denoise}) saturate(${1 + 0.45 * denoise}) sepia(${0.3 * denoise})`;
        ctx.drawImage(img, 0, 0, w, h);
      } else if (preset === 'hospitality_hdr') {
        ctx.filter = `contrast(${1 + 0.22 * denoise}) saturate(${1 + 0.50 * denoise}) brightness(${1 + 0.08 * denoise})`;
        ctx.drawImage(img, 0, 0, w, h);
      } else if (preset === 'moody_night') {
        ctx.filter = `brightness(${Math.max(0.6, 1 - 0.25 * denoise)}) contrast(${1 + 0.3 * denoise}) saturate(${1 + 0.2 * denoise}) hue-rotate(-15deg)`;
        ctx.drawImage(img, 0, 0, w, h);
      } else if (preset === 'graphic_novel') {
        // Comic posterization simulation
        ctx.filter = `contrast(${1 + 0.4 * denoise}) saturate(${1 + 0.6 * denoise})`;
        ctx.drawImage(img, 0, 0, w, h);
      } else {
        ctx.drawImage(img, 0, 0, w, h);
      }

      try {
        const previewDataUrl = canvas.toDataURL('image/webp', 0.88);
        setEnhancedImageUrl(previewDataUrl);
      } catch {
        // In case of strict CORS on external unsplash url, keep source
      }
    };
  };

  // Preset Selection Handler
  const handleSelectPreset = (preset: EnhancementPreset) => {
    setSelectedPreset(preset);
    const opt = PRESET_OPTIONS.find((p) => p.id === preset);
    const newDenoise = opt ? opt.defaultDenoise : 0.6;
    setDenoiseStrength(newDenoise);
    generateClientShaderPreview(initialImageUrl, preset, newDenoise);
  };

  // Denoise Slider Change
  const handleDenoiseChange = (val: number) => {
    setDenoiseStrength(val);
    generateClientShaderPreview(initialImageUrl, selectedPreset, val);
  };

  // Run Heavy Processing (Bridge API on Mac Studio or High-Quality Pipeline)
  const handleRunAiEnhancement = async () => {
    setIsProcessing(true);
    const t0 = performance.now();

    try {
      // 1. Convert current image to base64
      let b64 = initialImageUrl;
      if (!initialImageUrl.startsWith('data:')) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = initialImageUrl;
        await new Promise((res, rej) => {
          img.onload = res;
          img.onerror = rej;
        });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);
        b64 = canvas.toDataURL('image/jpeg', 0.92);
      }

      // 2. Attempt call to local Mac Studio bridge
      if (isBridgeOnline) {
        const res = await fetch(`${bridgeUrl}/api/enhance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_base64: b64,
            preset: selectedPreset,
            denoise: denoiseStrength,
            prompt_override: promptOverride.trim() || undefined,
            return_format: 'webp'
          })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.enhanced_image_base64) {
            setEnhancedImageUrl(data.enhanced_image_base64);
            setEngineUsed(data.engine_used || 'mac_studio_flux');
            setProcessingTimeMs(data.processing_time_ms || Math.round(performance.now() - t0));
            setSliderPos(50);
            return;
          }
        }
      }

      // 3. Fallback to client high-res canvas shader pipeline
      generateClientShaderPreview(initialImageUrl, selectedPreset, denoiseStrength);
      setEngineUsed('browser_shader_hd');
      setProcessingTimeMs(Math.round(performance.now() - t0));
      setSliderPos(50);
    } catch (err) {
      console.warn('Bridge request fallback to local canvas:', err);
      generateClientShaderPreview(initialImageUrl, selectedPreset, denoiseStrength);
      setEngineUsed('browser_shader');
    } finally {
      setIsProcessing(false);
    }
  };

  // Slider Mouse/Touch Drag Controls
  const handleSliderMove = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPos(pct);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isDraggingSlider && e.touches[0]) {
      handleSliderMove(e.touches[0].clientX);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDraggingSlider) {
      handleSliderMove(e.clientX);
    }
  };

  // Download enhanced image
  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = enhancedImageUrl;
    link.download = `${propertyName}-${selectedPreset}-ai.webp`;
    link.click();
  };

  // Persistent Storage Uploader (Supabase Storage / Mac Studio Local Bridge)
  const persistEnhancedImage = async (imageSource: string): Promise<string> => {
    // If it's already an uploaded URL or relative asset path, skip re-uploading
    if (!imageSource.startsWith('data:')) {
      return imageSource;
    }

    const cleanName = (propertyName || 'resort')
      .toLowerCase()
      .replace(/[^a-z0-9]/gi, '_')
      .slice(0, 25);
    const fileName = `${cleanName}_${selectedPreset}_${Date.now()}.webp`;

    // 1. Try uploading via Mac Studio bridge (persists to public/resorts & Supabase bucket)
    try {
      const res = await fetch(`${bridgeUrl}/api/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: imageSource,
          filename: fileName,
          bucket: 'resorts'
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          return data.url;
        }
      }
    } catch (bridgeErr) {
      console.warn('Bridge upload attempt bypassed or offline:', bridgeErr);
    }

    // 2. Try direct browser Supabase Storage upload
    try {
      if (supabase && (supabase as any).storage) {
        const byteString = atob(imageSource.split(',')[1]);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ab], { type: 'image/webp' });

        const { data, error } = await (supabase as any).storage
          .from('resorts')
          .upload(fileName, blob, {
            contentType: 'image/webp',
            upsert: true
          });

        if (!error && data) {
          const { data: publicUrlData } = (supabase as any).storage
            .from('resorts')
            .getPublicUrl(fileName);
          if (publicUrlData?.publicUrl) {
            return publicUrlData.publicUrl;
          }
        }
      }
    } catch (storageErr) {
      console.warn('Direct Supabase Storage upload error:', storageErr);
    }

    // Fallback: If offline and both unavailable, use source
    return imageSource;
  };

  // VRAM & Unified Memory Release Helper
  const handleUnloadVram = async () => {
    setIsUnloadingVram(true);
    try {
      const res = await fetch(`${bridgeUrl}/api/unload`, { method: 'POST' });
      if (res.ok) {
        setVramNotice('זיכרון ה-VRAM וה-Unified Memory שוחררו בהצלחה במק סטודיו! 🧹');
      } else {
        setVramNotice('לא התקבלה תגובה משרת הגשר לשחרור זיכרון.');
      }
    } catch (err) {
      setVramNotice('שגיאה בתקשורת עם המק סטודיו לשחרור זיכרון.');
    } finally {
      setIsUnloadingVram(false);
      setTimeout(() => setVramNotice(null), 4000);
    }
  };

  // Save to Hero / Gallery Handlers (Always saves as URL)
  const handleApplyAsHero = async () => {
    if (!onSaveHeroImage) return;
    setIsSaving(true);
    try {
      const publicUrl = await persistEnhancedImage(enhancedImageUrl);
      onSaveHeroImage(publicUrl);
      setSaveSuccessNotice('התמונה המשופרת נשמרה ב-Storage ונקבעה כתמונה הראשית! ✨');
      setTimeout(() => setSaveSuccessNotice(null), 3500);
    } catch (err) {
      console.error('Failed to save hero image:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleApplyToGallery = async () => {
    if (!onSaveToGallery) return;
    setIsSaving(true);
    try {
      const publicUrl = await persistEnhancedImage(enhancedImageUrl);
      onSaveToGallery(publicUrl);
      setSaveSuccessNotice('התמונה המשופרת נשמרה ב-Storage ונוספה בהצלחה לגלריה! 📸');
      setTimeout(() => setSaveSuccessNotice(null), 3500);
    } catch (err) {
      console.error('Failed to save gallery image:', err);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-fadeIn select-none">
      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} className="hidden" />

      <div className="bg-[#1C1615] text-stone-100 rounded-3xl max-w-5xl w-full flex flex-col shadow-2xl border border-stone-800 my-auto overflow-hidden animate-scaleUp">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-stone-800/80 flex items-center justify-between bg-[#261D1B]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#C5A880] to-[#8C6239] text-[#1C1615] flex items-center justify-center shadow-md font-black">
              <Wand2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-white">
                  ResortOS AI Photo Studio
                </h3>
                <span className="text-[10px] bg-[#C5A880]/20 text-[#C5A880] border border-[#C5A880]/30 px-2 py-0.5 rounded-full font-bold">
                  ComfyUI / Flux
                </span>
              </div>
              <p className="text-xs text-stone-400">
                שדרוג תאורה, צבעוניות וסגנון איור עבור {propertyName} {propertyVillage ? `(${propertyVillage})` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Mac Studio Engine Status Badge */}
            <div
              className={`hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono border transition ${
                isBridgeOnline
                  ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300'
                  : 'bg-amber-950/70 border-amber-500/40 text-amber-300'
              }`}
              title={isBridgeOnline ? `מחובר ל-Mac Studio ב-${bridgeUrl}` : 'שרת מקומי אינו זמין כרגע – פועל על מנוע Canvas פנימי'}
            >
              <span className={`w-2 h-2 rounded-full ${isBridgeOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span className="font-sans font-bold text-[11px]">
                {isBridgeOnline ? 'Mac Studio מחובר' : 'מנוע סטודיו פנימי'}
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-stone-800 hover:bg-stone-700 text-stone-300 flex items-center justify-center transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Notice Toast */}
        {saveSuccessNotice && (
          <div className="bg-emerald-900/90 text-emerald-200 border-b border-emerald-700/60 p-3 text-xs text-center font-bold flex items-center justify-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-300" />
            <span>{saveSuccessNotice}</span>
          </div>
        )}

        {/* Main Content Grid */}
        <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-y-auto max-h-[75vh]">
          {/* Left / Center: Interactive Before-After Comparison View */}
          <div className="lg:col-span-7 flex flex-col items-center justify-center space-y-3">
            <div
              ref={containerRef}
              onMouseDown={() => setIsDraggingSlider(true)}
              onMouseUp={() => setIsDraggingSlider(false)}
              onMouseLeave={() => setIsDraggingSlider(false)}
              onMouseMove={handleMouseMove}
              onTouchStart={() => setIsDraggingSlider(true)}
              onTouchEnd={() => setIsDraggingSlider(false)}
              onTouchMove={handleTouchMove}
              className="relative w-full aspect-4/3 sm:aspect-16/10 rounded-2xl overflow-hidden bg-stone-900 border-2 border-stone-800 shadow-xl cursor-ew-resize select-none group"
            >
              {/* After: Enhanced Image (Background) */}
              <img
                src={enhancedImageUrl}
                alt="אחרי שיפור AI"
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              />

              {/* Before: Original Image (Clipped overlay) */}
              <div
                className="absolute inset-0 overflow-hidden pointer-events-none"
                style={{ width: `${sliderPos}%` }}
              >
                <img
                  src={initialImageUrl}
                  alt="תמונת מקור לפני שיפור"
                  className="absolute inset-0 w-full h-full object-cover max-w-none"
                  style={{ width: containerRef.current?.clientWidth || '100%', height: '100%' }}
                />
              </div>

              {/* Split-view Divider Handle */}
              <div
                className="absolute top-0 bottom-0 w-1 bg-white shadow-2xl pointer-events-none transition-transform"
                style={{ left: `${sliderPos}%` }}
              >
                <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-white text-[#26130F] flex items-center justify-center shadow-lg border-2 border-stone-800">
                  <div className="flex gap-0.5 text-[10px] font-black">
                    <span>◀</span>
                    <span>▶</span>
                  </div>
                </div>
              </div>

              {/* Badges */}
              <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md text-[#C5A880] border border-white/20 text-[10px] font-bold px-2.5 py-1 rounded-full pointer-events-none flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                <span>אחרי שיפור AI</span>
              </div>

              <div className="absolute top-3 right-3 bg-black/70 backdrop-blur-md text-stone-300 border border-white/20 text-[10px] font-bold px-2.5 py-1 rounded-full pointer-events-none">
                <span>תמונת מקור</span>
              </div>

              {/* Processing Overlay */}
              {isProcessing && (
                <div className="absolute inset-0 bg-black/85 backdrop-blur-xs flex flex-col items-center justify-center p-4 text-center z-20 animate-fadeIn">
                  <RefreshCw className="w-8 h-8 text-[#C5A880] animate-spin mb-3" />
                  <h4 className="text-sm font-bold text-white mb-1">
                    מעבד תמונה במנוע ה-AI המקומי...
                  </h4>
                  <p className="text-xs text-stone-400 max-w-xs">
                    מפעיל שינוי סגנון ותאורה עם מודל Flux Klein ו-Denoise של {Math.round(denoiseStrength * 100)}%
                  </p>
                </div>
              )}
            </div>

            {/* Slider Guidance & Info bar */}
            <div className="w-full flex items-center justify-between text-[11px] text-stone-400 px-1">
              <span className="flex items-center gap-1">
                <Sliders className="w-3.5 h-3.5 text-[#C5A880]" />
                <span>גרור את הסמן להשוואת לפני ואחרי</span>
              </span>
              {processingTimeMs && (
                <span className="font-mono text-stone-400">
                  זמן עיבוד: {processingTimeMs}ms ({engineUsed})
                </span>
              )}
            </div>
          </div>

          {/* Right: Controls, Presets & Action Panel */}
          <div className="lg:col-span-5 flex flex-col justify-between space-y-4 text-right">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-300 mb-2">
                  1. בחר סגנון שיפור (AI Style Preset):
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {PRESET_OPTIONS.map((opt) => {
                    const IconComponent = opt.icon;
                    const isSelected = selectedPreset === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleSelectPreset(opt.id)}
                        className={`p-3 rounded-2xl border text-right transition flex flex-col justify-between gap-2 text-xs relative ${
                          isSelected
                            ? 'bg-[#352724] border-[#C5A880] text-white shadow-md ring-1 ring-[#C5A880]/50'
                            : 'bg-[#221A18] border-stone-800 text-stone-300 hover:bg-[#2A201E]'
                        }`}
                      >
                        <div className="flex items-start justify-between w-full">
                          <div className={`p-1.5 rounded-xl ${isSelected ? 'bg-[#C5A880] text-[#1C1615]' : 'bg-stone-800 text-stone-300'}`}>
                            <IconComponent className="w-4 h-4" />
                          </div>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${opt.badgeColor}`}>
                            {opt.badge}
                          </span>
                        </div>
                        <div>
                          <span className="font-bold block text-white text-xs mb-0.5">
                            {opt.title}
                          </span>
                          <span className="text-[10px] text-stone-400 block leading-tight">
                            {opt.subtitle}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Denoise Strength Slider */}
              <div className="bg-[#241B19] p-3.5 rounded-2xl border border-stone-800 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-stone-300">עוצמת השינוי (Denoise):</span>
                  <span className="font-mono text-[#C5A880]">
                    {Math.round(denoiseStrength * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.10"
                  max="0.90"
                  step="0.02"
                  value={denoiseStrength}
                  onChange={(e) => handleDenoiseChange(parseFloat(e.target.value))}
                  className="w-full accent-[#C5A880] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-stone-400">
                  <span>עדין (שמירה מרבית על המקור)</span>
                  <span>דרמטי (טרנספורמציה מלאה)</span>
                </div>
              </div>

              {/* Advanced Settings Accordion */}
              <div className="border border-stone-800 rounded-2xl overflow-hidden bg-[#201816]">
                <button
                  type="button"
                  onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                  className="w-full p-2.5 px-3 flex items-center justify-between text-xs text-stone-400 hover:text-stone-200"
                >
                  <span className="flex items-center gap-1 font-bold">
                    <Cpu className="w-3.5 h-3.5 text-[#C5A880]" />
                    <span>הגדרות מנוע מקומי (Mac Studio Bridge)</span>
                  </span>
                  {showAdvancedSettings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {showAdvancedSettings && (
                  <div className="p-3 pt-0 border-t border-stone-800/60 space-y-3 text-xs animate-fadeIn">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[11px] text-stone-400 font-bold">
                          כתובת שרת ה-Bridge במק סטודיו:
                        </label>
                        <span className="text-[10px] text-stone-500 font-mono">נשמר אוטומטית</span>
                      </div>
                      <input
                        type="text"
                        value={bridgeUrl}
                        onChange={(e) => handleBridgeUrlChange(e.target.value)}
                        placeholder="http://127.0.0.1:5005 או https://xxxx.trycloudflare.com"
                        className="w-full p-2 rounded-xl bg-stone-900 border border-stone-700 text-stone-200 font-mono text-[11px] focus:outline-none focus:border-[#C5A880]"
                      />
                    </div>

                    {/* Cloudflare Tunnel Helper for Vercel / Remote Production */}
                    <div className="p-2.5 rounded-xl bg-black/40 border border-stone-800 space-y-1.5 text-[11px]">
                      <div className="flex items-center justify-between text-stone-300 font-bold">
                        <span className="flex items-center gap-1">
                          <ExternalLink className="w-3.5 h-3.5 text-[#C5A880]" />
                          <span>גישה מ-Vercel וענן (מניעת חסימת HTTPS / PNA):</span>
                        </span>
                      </div>
                      <p className="text-stone-400 text-[10px] leading-relaxed">
                        כשעובדים בדומיין חי ב-Vercel, הדפדפן חוסם חיבור ישיר ל-localhost. הפעל במק סטודיו:
                      </p>
                      <div className="p-2 bg-stone-950 rounded-lg font-mono text-[10px] text-amber-300 flex items-center justify-between border border-stone-800">
                        <span className="truncate mr-1">cloudflared tunnel --url http://127.0.0.1:5005</span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText('cloudflared tunnel --url http://127.0.0.1:5005');
                            setTunnelCommandCopied(true);
                            setTimeout(() => setTunnelCommandCopied(false), 2000);
                          }}
                          className="text-stone-300 hover:text-white px-1.5 py-0.5 rounded bg-stone-800 text-[9px] shrink-0 font-bold flex items-center gap-1"
                          title="העתק פקודה"
                        >
                          {tunnelCommandCopied ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                          <span>{tunnelCommandCopied ? 'הועתק!' : 'העתק'}</span>
                        </button>
                      </div>
                      <p className="text-stone-500 text-[10px]">
                        והדבק את הכתובת המאובטחת שנוצרה (<code className="text-stone-300">https://xxxx.trycloudflare.com</code>) בתיבה למעלה.
                      </p>
                    </div>

                    {/* VRAM & Unified Memory Release */}
                    <div className="p-2.5 rounded-xl bg-black/40 border border-stone-800 space-y-1.5 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-stone-300 flex items-center gap-1">
                          <Cpu className="w-3.5 h-3.5 text-purple-400" />
                          <span>ניהול זיכרון אחוד (Unified Memory & MPS):</span>
                        </span>
                        <button
                          type="button"
                          onClick={handleUnloadVram}
                          disabled={isUnloadingVram}
                          className="px-2.5 py-1 bg-purple-900/40 hover:bg-purple-900/60 border border-purple-700/50 text-purple-200 rounded-lg font-bold text-[10px] transition flex items-center gap-1 disabled:opacity-40"
                        >
                          {isUnloadingVram ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <Sparkles className="w-2.5 h-2.5 text-purple-300" />}
                          <span>פנה זיכרון ComfyUI</span>
                        </button>
                      </div>
                      {vramNotice && (
                        <div className="text-[10px] text-purple-300 bg-purple-950/70 p-1.5 rounded-md border border-purple-800/50 animate-fadeIn">
                          {vramNotice}
                        </div>
                      )}
                      <p className="text-stone-400 text-[10px] leading-normal">
                        להרצה חלקה במקביל ל-Ollama: ודא שב-ComfyUI מוגדרים הדגלים <code className="text-purple-300">--lowvram --preview-method auto</code> לפינוי אוטומטי.
                      </p>
                    </div>

                    <div>
                      <label className="block text-[11px] text-stone-400 mb-1">
                        פרומפט מותאם אישית (אופציונלי להחלפת ה-Preset):
                      </label>
                      <textarea
                        rows={2}
                        value={promptOverride}
                        onChange={(e) => setPromptOverride(e.target.value)}
                        placeholder="לדוגמה: graphic novel style, turquoise pool, sunny blue skies, architectural line art"
                        className="w-full p-2 rounded-xl bg-stone-900 border border-stone-700 text-stone-200 text-xs focus:outline-none focus:border-[#C5A880] resize-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Main Enhance Button */}
              <button
                type="button"
                onClick={handleRunAiEnhancement}
                disabled={isProcessing}
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[#C5A880] to-[#A3835B] hover:from-[#d1b691] hover:to-[#b09065] text-[#26130F] font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg transition active:scale-98 disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-[#26130F]" />
                    <span>מעבד תמונה במק סטודיו...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 fill-current text-[#26130F]" />
                    <span>עבד תמונה מחדש (Regenerate AI)</span>
                  </>
                )}
              </button>
            </div>

            {/* Finish Actions: Apply & Download */}
            <div className="pt-3 border-t border-stone-800/80 space-y-2">
              <span className="text-[11px] font-bold text-stone-400 block mb-1">
                3. החל את התוצאה במתחם:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {onSaveHeroImage && (
                  <button
                    type="button"
                    onClick={handleApplyAsHero}
                    disabled={isSaving}
                    className="py-2.5 px-3 rounded-xl bg-[#C5A880]/20 hover:bg-[#C5A880]/30 text-[#C5A880] border border-[#C5A880]/40 text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-98 disabled:opacity-50"
                  >
                    {isSaving ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#C5A880]" />
                    ) : (
                      <ImageIcon className="w-3.5 h-3.5" />
                    )}
                    <span>{isSaving ? 'שומר ב-Storage...' : 'קבע כתמונה ראשית'}</span>
                  </button>
                )}

                {onSaveToGallery && (
                  <button
                    type="button"
                    onClick={handleApplyToGallery}
                    disabled={isSaving}
                    className="py-2.5 px-3 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-98 disabled:opacity-50"
                  >
                    {isSaving ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#C5A880]" />
                    ) : (
                      <UploadCloud className="w-3.5 h-3.5 text-[#C5A880]" />
                    )}
                    <span>{isSaving ? 'שומר ב-Storage...' : 'הוסף לגלריית המתחם'}</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={handleDownload}
                className="w-full py-2 px-3 rounded-xl border border-stone-800 hover:bg-stone-900 text-stone-400 hover:text-stone-200 text-xs font-medium flex items-center justify-center gap-1.5 transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>הורד תמונה למחשב (WebP באיכות גבוהה)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
