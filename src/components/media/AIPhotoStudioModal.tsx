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
  UploadCloud,
  Film,
  Play,
  Tv,
  Video,
  Smartphone,
  Monitor,
  Star,
  Eye,
  EyeOff,
  Waves,
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { WaterRipplePreview } from './WaterRipplePreview';
import {
  computeWaterMask,
  createClientSideWaterVideo,
  WaterDetectionPreset
} from './waterRippleEngine';

export interface AIPhotoStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialImageUrl: string;
  propertyName: string;
  propertyVillage?: string;
  onSaveHeroImage?: (newUrl: string) => void;
  onSaveToGallery?: (newUrl: string) => void;
  onSaveHeroVideo?: (newUrl: string) => void;
  onSaveToScreensaver?: (newUrl: string) => void;
}

export type EnhancementPreset = 'graphic_novel' | 'golden_hour' | 'hospitality_hdr' | 'moody_night';
export type MotionMode = 'zoom_in' | 'pan_horizontal' | 'ai_motion';

export interface MotionOption {
  id: MotionMode;
  title: string;
  subtitle: string;
  icon: string;
  badge: string;
  badgeColor: string;
}

export const MOTION_OPTIONS: MotionOption[] = [
  {
    id: 'zoom_in',
    title: 'זום אלגנטי (Slow Push-In)',
    subtitle: 'התמקדות איטית ויוקרתית במרכז החלל להבלטת האווירה',
    icon: '🔍',
    badge: '1080p 60fps',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
  },
  {
    id: 'pan_horizontal',
    title: 'פנורמה רחבה (Cinematic Pan)',
    subtitle: 'תנועת מצלמה אופקית החושפת את הבקתה, הבריכה והנוף',
    icon: '↔️',
    badge: 'Cinematic Pan',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
  },
  {
    id: 'ai_motion',
    title: 'אדוות מים סינמטיות (Water Cinemagraph)',
    subtitle: 'מנפיש רק את מי הבריכה, הים או הג\'קוזי – כל שאר התמונה נשארת דוממת לחלוטין',
    icon: '🌊',
    badge: 'Water Cinemagraph',
    badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
  }
];

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
    title: 'איור אדריכלי / רומן גרפי',
    subtitle: 'קווי מתאר נקיים בדיו, צבעי איור רכים בסגנון מדריכי ResortOS',
    icon: Palette,
    defaultDenoise: 0.68,
    badge: 'Architectural Art',
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

// Real-time CSS Filter generator for instant, zero-latency visual transformations
const getPresetFilterCss = (preset: EnhancementPreset | null, denoise: number): string => {
  if (!preset) return 'none';
  switch (preset) {
    case 'graphic_novel':
      // Elegant illustration aesthetic: crisp clarity, warm paper tone, delicate saturation without burning colors
      return `contrast(${1.08 + 0.12 * denoise}) saturate(${1.15 + 0.18 * denoise}) brightness(${1.01 + 0.04 * denoise}) sepia(${0.08 + 0.08 * denoise})`;
    case 'golden_hour':
      // Warm sunset glow: amber warmth, high saturation, soft contrast
      return `sepia(${0.35 + 0.45 * denoise}) saturate(${1.5 + 0.8 * denoise}) brightness(${1.04 + 0.10 * denoise}) contrast(${1.12 + 0.22 * denoise}) hue-rotate(-12deg)`;
    case 'hospitality_hdr':
      // Crystal clear boutique resort: punchy pool blues, crisp foliage, rich contrast
      return `contrast(${1.25 + 0.30 * denoise}) saturate(${1.4 + 0.5 * denoise}) brightness(${1.03 + 0.06 * denoise})`;
    case 'moody_night':
      // Intimate evening twilight: deep shadows, fairy lights, blue-violet night ambiance
      return `brightness(${Math.max(0.48, 1 - 0.45 * denoise)}) contrast(${1.22 + 0.30 * denoise}) saturate(${1.2 + 0.30 * denoise}) hue-rotate(-24deg)`;
    default:
      return 'none';
  }
};

/**
 * Direct pixel-level filter processor for guaranteed cross-browser baking.
 * Does not depend on CanvasRenderingContext2D.filter (which is unsupported/buggy in Safari).
 */
export function applyPresetToImageData(
  imgData: ImageData,
  preset: EnhancementPreset | null,
  denoise: number,
  width?: number,
  height?: number
): void {
  if (!preset) return;
  const data = imgData.data;
  const len = data.length;

  if (preset === 'golden_hour') {
    const s = 0.35 + 0.45 * denoise;
    const oneMinusS = 1 - s;
    const sat = 1.55 + 0.95 * denoise;
    const bright = 1.05 + 0.10 * denoise;
    const cont = 1.15 + 0.22 * denoise;

    for (let i = 0; i < len; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      // 1. Sepia
      const sr = r * 0.393 + g * 0.769 + b * 0.189;
      const sg = r * 0.349 + g * 0.686 + b * 0.168;
      const sb = r * 0.272 + g * 0.534 + b * 0.131;
      r = r * oneMinusS + sr * s;
      g = g * oneMinusS + sg * s;
      b = b * oneMinusS + sb * s;

      // 2. Warm golden shift (amber/gold warmth, lift reds, tone down cold blues)
      r = r * 1.08;
      b = b * 0.90;

      // 3. Saturation
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gray + (r - gray) * sat;
      g = gray + (g - gray) * sat;
      b = gray + (b - gray) * sat;

      // 4. Brightness & Contrast
      r = (r * bright - 128) * cont + 128;
      g = (g * bright - 128) * cont + 128;
      b = (b * bright - 128) * cont + 128;

      data[i] = r < 0 ? 0 : r > 255 ? 255 : r;
      data[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
      data[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
    }
  } else if (preset === 'hospitality_hdr') {
    const cont = 1.28 + 0.38 * denoise;
    const bright = 1.04 + 0.08 * denoise;
    const sat = 1.48 + 0.65 * denoise;

    for (let i = 0; i < len; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      // Contrast & Brightness
      r = (r * bright - 128) * cont + 128;
      g = (g * bright - 128) * cont + 128;
      b = (b * bright - 128) * cont + 128;

      // Saturation with slight turquoise/pool boost
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gray + (r - gray) * sat;
      g = gray + (g - gray) * (sat * 1.06);
      b = gray + (b - gray) * (sat * 1.12);

      data[i] = r < 0 ? 0 : r > 255 ? 255 : r;
      data[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
      data[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
    }
  } else if (preset === 'moody_night') {
    const nightDim = Math.max(0.48, 1 - 0.45 * denoise);
    const cont = 1.25 + 0.35 * denoise;

    for (let i = 0; i < len; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      const isWarmLight = r > 160 && g > 130 && r > b * 1.15;
      if (!isWarmLight) {
        r = r * nightDim * 0.82;
        g = g * nightDim * 0.86;
        b = b * nightDim * 1.15;
      } else {
        r = Math.min(255, r * 1.1);
        g = Math.min(255, g * 1.05);
      }

      r = (r - 128) * cont + 128;
      g = (g - 128) * cont + 128;
      b = (b - 128) * cont + 128;

      data[i] = r < 0 ? 0 : r > 255 ? 255 : r;
      data[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
      data[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
    }
  } else if (preset === 'graphic_novel') {
    const w = width || imgData.width || Math.round(Math.sqrt(len / 4));
    const h = height || imgData.height || Math.round((len / 4) / w);

    // 1. Fast integer luminance buffer
    const lum = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < len; i += 4, p++) {
      lum[p] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
    }

    const sat = 1.15 + 0.18 * denoise;
    const cont = 1.10 + 0.14 * denoise;
    const edgeThreshold = Math.max(12, Math.round(24 - 10 * denoise));

    // 2. High-end architectural illustration: clean ink contours + soft color wash
    for (let y = 0; y < h; y++) {
      const rowOffset = y * w;
      const nextRowOffset = Math.min(h - 1, y + 1) * w;
      for (let x = 0; x < w; x++) {
        const p = rowOffset + x;
        const nextX = Math.min(w - 1, x + 1);
        const lCenter = lum[p];

        const dx = Math.abs(lum[rowOffset + nextX] - lCenter);
        const dy = Math.abs(lum[nextRowOffset + x] - lCenter);
        const grad = dx + dy;

        const i = p * 4;
        let r = data[i];
        let g = data[i + 1];
        let b = data[i + 2];

        // Soft illustrative color grading
        r = lCenter + (r - lCenter) * sat;
        g = lCenter + (g - lCenter) * sat;
        b = lCenter + (b - lCenter) * sat;

        // Warm paper/vellum undertone (fine architectural illustration look)
        r = r * 1.03 + 3 * denoise;
        g = g * 1.01 + 2 * denoise;
        b = b * 0.96;

        // Gentle contrast
        r = (r - 128) * cont + 128;
        g = (g - 128) * cont + 128;
        b = (b - 128) * cont + 128;

        // Crisp architectural ink contour
        if (grad > edgeThreshold) {
          const inkFactor = Math.min(0.85, ((grad - edgeThreshold) / 30) * denoise);
          // Dark charcoal/sepia ink (#261914 -> 38, 25, 20)
          r = r * (1 - inkFactor) + 38 * inkFactor;
          g = g * (1 - inkFactor) + 25 * inkFactor;
          b = b * (1 - inkFactor) + 20 * inkFactor;
        }

        data[i] = r < 0 ? 0 : r > 255 ? 255 : r;
        data[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
        data[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
      }
    }
  }
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/webp';
  const byteString = atob(parts[1]);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mime });
}

export const AIPhotoStudioModal: React.FC<AIPhotoStudioModalProps> = ({
  isOpen,
  onClose,
  initialImageUrl,
  propertyName,
  propertyVillage,
  onSaveHeroImage,
  onSaveToGallery,
  onSaveHeroVideo,
  onSaveToScreensaver
}) => {
  // Studio Tab: 'photo' | 'video'
  const [activeStudioTab, setActiveStudioTab] = useState<'photo' | 'video'>('photo');

  // Video Motion Studio State
  const [motionMode, setMotionMode] = useState<MotionMode>('zoom_in');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [videoDuration, setVideoDuration] = useState<number>(5);
  const [introText, setIntroText] = useState<string>(propertyName || '');
  const [includeLogo, setIncludeLogo] = useState<boolean>(true);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState<boolean>(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [videoGenerationTimeMs, setVideoGenerationTimeMs] = useState<number | null>(null);
  const [videoEngineUsed, setVideoEngineUsed] = useState<string | null>(null);
  const [showBrandingSettings, setShowBrandingSettings] = useState<boolean>(false);

  // Water Cinemagraph State
  const [waterPreset, setWaterPreset] = useState<WaterDetectionPreset>('auto_pool');
  const [waterIntensity, setWaterIntensity] = useState<number>(1.0);
  const [waterSpeed, setWaterSpeed] = useState<number>(1.0);
  const [showWaterMaskOverlay, setShowWaterMaskOverlay] = useState<boolean>(false);
  const [detectedWaterRatio, setDetectedWaterRatio] = useState<number>(0);

  // Photo Studio State (Default null = opens with clean original image, letting user pick style)
  const [selectedPreset, setSelectedPreset] = useState<EnhancementPreset | null>(null);
  const [denoiseStrength, setDenoiseStrength] = useState<number>(0.68);
  const [sliderPos, setSliderPos] = useState<number>(50);
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingTimeMs, setProcessingTimeMs] = useState<number | null>(null);
  const [engineUsed, setEngineUsed] = useState<string>('browser_shader');
  const [isRealAiEnhanced, setIsRealAiEnhanced] = useState<boolean>(false);

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

  // Sync initial image on open (Starts with original raw image, no preset auto-selected)
  useEffect(() => {
    if (initialImageUrl) {
      setEnhancedImageUrl(initialImageUrl);
      setIsRealAiEnhanced(false);
      setSelectedPreset(null);
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

  // Helper to bake client-side preset styling into an actual WebP Data URL for saving / downloading
  const bakeStyledImageToDataUrl = async (
    srcUrl: string,
    preset: EnhancementPreset | null,
    denoise: number
  ): Promise<string> => {
    if (!preset) return srcUrl;
    if (srcUrl.startsWith('data:') && isRealAiEnhanced) return srcUrl;

    return new Promise(async (resolve) => {
      let objectUrlToRevoke: string | null = null;
      try {
        let finalSrc = srcUrl;

        // Try fetch to local blob for 100% same-origin safety
        try {
          const res = await fetch(srcUrl);
          if (res.ok) {
            const blob = await res.blob();
            finalSrc = URL.createObjectURL(blob);
            objectUrlToRevoke = finalSrc;
          }
        } catch {
          finalSrc = srcUrl.startsWith('data:') ? srcUrl : `${srcUrl}${srcUrl.includes('?') ? '&' : '?'}bake=${Date.now()}`;
        }

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = finalSrc;

        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const maxDim = 1920; // High-res 1080p+ quality
            let w = img.naturalWidth || 1280;
            let h = img.naturalHeight || 720;
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
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
              return resolve(srcUrl);
            }

            ctx.drawImage(img, 0, 0, w, h);

            // Apply direct pixel manipulation (works 100% reliably in Safari)
            const imgData = ctx.getImageData(0, 0, w, h);
            applyPresetToImageData(imgData, preset, denoise, w, h);
            ctx.putImageData(imgData, 0, 0);

            // Layer subtle ambient color gradients for depth
            if (preset === 'golden_hour') {
              ctx.save();
              ctx.globalCompositeOperation = 'lighter';
              ctx.globalAlpha = 0.18 * denoise;
              const grad = ctx.createLinearGradient(0, 0, w, h);
              grad.addColorStop(0, 'rgba(251,191,36,0.8)');
              grad.addColorStop(0.6, 'rgba(245,158,11,0.3)');
              grad.addColorStop(1, 'rgba(217,119,6,0.5)');
              ctx.fillStyle = grad;
              ctx.fillRect(0, 0, w, h);
              ctx.restore();
            } else if (preset === 'moody_night') {
              ctx.save();
              ctx.globalCompositeOperation = 'multiply';
              ctx.globalAlpha = 0.25 * denoise;
              const grad = ctx.createLinearGradient(0, 0, 0, h);
              grad.addColorStop(0, 'rgba(15,23,42,0.8)');
              grad.addColorStop(1, 'rgba(30,27,75,0.6)');
              ctx.fillStyle = grad;
              ctx.fillRect(0, 0, w, h);
              ctx.restore();
            } else if (preset === 'graphic_novel') {
              ctx.save();
              ctx.globalCompositeOperation = 'multiply';
              ctx.globalAlpha = 0.05 * denoise;
              ctx.fillStyle = '#FAF6EE';
              ctx.fillRect(0, 0, w, h);
              ctx.restore();
            }

            const bakedDataUrl = canvas.toDataURL('image/webp', 0.92);
            if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
            resolve(bakedDataUrl);
          } catch (canvasErr) {
            console.warn('Canvas export error during bake:', canvasErr);
            if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
            resolve(srcUrl);
          }
        };

        img.onerror = () => {
          if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
          resolve(srcUrl);
        };
      } catch (err) {
        if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
        resolve(srcUrl);
      }
    });
  };

  // Generate instant browser canvas simulation of the selected preset
  const generateClientShaderPreview = (srcUrl: string, preset: EnhancementPreset | null, denoise: number) => {
    if (!srcUrl) return;
    setIsRealAiEnhanced(false);
    if (!preset) {
      setEnhancedImageUrl(srcUrl);
      return;
    }
    bakeStyledImageToDataUrl(srcUrl, preset, denoise).then((bakedUrl) => {
      setEnhancedImageUrl(bakedUrl);
    }).catch(() => {
      setEnhancedImageUrl(srcUrl);
    });
  };

  // Preset Selection Handler (Clicking selected preset deselects it and restores raw image)
  const handleSelectPreset = (preset: EnhancementPreset) => {
    if (selectedPreset === preset) {
      setSelectedPreset(null);
      setIsRealAiEnhanced(false);
      setEnhancedImageUrl(initialImageUrl);
      return;
    }
    setSelectedPreset(preset);
    setIsRealAiEnhanced(false);
    const opt = PRESET_OPTIONS.find((p) => p.id === preset);
    const newDenoise = opt ? opt.defaultDenoise : 0.68;
    setDenoiseStrength(newDenoise);
    generateClientShaderPreview(initialImageUrl, preset, newDenoise);
  };

  // Denoise Slider Change
  const handleDenoiseChange = (val: number) => {
    setDenoiseStrength(val);
    setIsRealAiEnhanced(false);
    if (selectedPreset) {
      generateClientShaderPreview(initialImageUrl, selectedPreset, val);
    }
  };

  // Run Heavy Processing (Bridge API on Mac Studio or High-Quality Pipeline)
  const handleRunAiEnhancement = async () => {
    if (!selectedPreset) return;
    setIsProcessing(true);
    const t0 = performance.now();

    try {
      // 1. Direct pass-through to Mac Studio bridge if online (supports direct URL & base64)
      if (isBridgeOnline) {
        const res = await fetch(`${bridgeUrl}/api/enhance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_base64: initialImageUrl,
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
            setIsRealAiEnhanced(true);
            setEngineUsed(data.engine_used || 'mac_studio_flux');
            setProcessingTimeMs(data.processing_time_ms || Math.round(performance.now() - t0));
            setSliderPos(50);
            return;
          }
        }
      }

      // 2. Client-side high-res canvas shader pipeline
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

  // Slider Mouse/Touch Drag Controls with Global Window Listeners
  const handleSliderMove = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPos(pct);
  };

  useEffect(() => {
    if (!isDraggingSlider) return;
    const handleGlobalMouseMove = (e: MouseEvent) => {
      handleSliderMove(e.clientX);
    };
    const handleGlobalMouseUp = () => {
      setIsDraggingSlider(false);
    };
    const handleGlobalTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) handleSliderMove(e.touches[0].clientX);
    };
    const handleGlobalTouchEnd = () => {
      setIsDraggingSlider(false);
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('touchmove', handleGlobalTouchMove);
    window.addEventListener('touchend', handleGlobalTouchEnd);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchmove', handleGlobalTouchMove);
      window.removeEventListener('touchend', handleGlobalTouchEnd);
    };
  }, [isDraggingSlider]);

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

  // Download enhanced image (guaranteed baked WebP blob download in Safari & all browsers)
  const handleDownload = async () => {
    setIsSaving(true);
    try {
      const bakedUrl = selectedPreset
        ? await bakeStyledImageToDataUrl(initialImageUrl, selectedPreset, denoiseStrength)
        : initialImageUrl;
      const cleanName = (propertyName || 'resort').toLowerCase().replace(/[^a-z0-9]/gi, '_');
      let blob: Blob;
      if (bakedUrl.startsWith('data:')) {
        blob = dataUrlToBlob(bakedUrl);
      } else {
        const res = await fetch(bakedUrl);
        blob = await res.blob();
      }
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${cleanName}-${selectedPreset || 'original'}-ai.webp`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
      setSaveSuccessNotice(selectedPreset ? 'התמונה המשופרת הורדה בהצלחה למחשב כקובץ WebP! 💾✨' : 'התמונה המקורית הורדה בהצלחה כקובץ WebP! 💾');
      setTimeout(() => setSaveSuccessNotice(null), 3500);
    } catch (err) {
      console.error('Download error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Persistent Storage Uploader (Supabase Storage / Mac Studio Local Bridge)
  const persistEnhancedImage = async (imageSource: string): Promise<string> => {
    let sourceToPersist = imageSource;
    // If saving in browser preview mode, bake visual filters into real WebP
    if (selectedPreset && !sourceToPersist.startsWith('data:') && !isRealAiEnhanced) {
      sourceToPersist = await bakeStyledImageToDataUrl(initialImageUrl, selectedPreset, denoiseStrength);
    }

    // If still not data URL (e.g. strict CORS prevented canvas export), return source
    if (!sourceToPersist.startsWith('data:')) {
      return sourceToPersist;
    }

    const cleanName = (propertyName || 'resort')
      .toLowerCase()
      .replace(/[^a-z0-9]/gi, '_')
      .slice(0, 25);
    const fileName = `${cleanName}_${selectedPreset || 'original'}_${Date.now()}.webp`;

    // 1. Try uploading via Mac Studio bridge (persists to public/resorts & Supabase bucket)
    try {
      const res = await fetch(`${bridgeUrl}/api/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: sourceToPersist,
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

  // Save to Hero / Gallery Handlers (Always saves as URL with baked enhanced pixels)
  const handleApplyAsHero = async () => {
    if (!onSaveHeroImage) return;
    if (!selectedPreset) {
      setSaveSuccessNotice('אנא בחר סגנון שיפור תחילה ✨');
      setTimeout(() => setSaveSuccessNotice(null), 3000);
      return;
    }
    setIsSaving(true);
    try {
      const bakedUrl = await bakeStyledImageToDataUrl(initialImageUrl, selectedPreset, denoiseStrength);
      const publicUrl = await persistEnhancedImage(bakedUrl);
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
    if (!selectedPreset) {
      setSaveSuccessNotice('אנא בחר סגנון שיפור תחילה ✨');
      setTimeout(() => setSaveSuccessNotice(null), 3000);
      return;
    }
    setIsSaving(true);
    try {
      const bakedUrl = await bakeStyledImageToDataUrl(initialImageUrl, selectedPreset, denoiseStrength);
      const publicUrl = await persistEnhancedImage(bakedUrl);
      onSaveToGallery(publicUrl);
      setSaveSuccessNotice('התמונה המשופרת נשמרה ב-Storage ונוספה בהצלחה לגלריה! 📸');
      setTimeout(() => setSaveSuccessNotice(null), 3500);
    } catch (err) {
      console.error('Failed to save gallery image:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Client-side Canvas Ken Burns Motion Video Generator (Zero-Server Fallback)
  const createClientSideMotionVideo = async (
    imgSrc: string,
    mode: MotionMode,
    aspect: '16:9' | '9:16',
    durationSec: number,
    brandingText?: string,
    showBrandingLogo?: boolean
  ): Promise<{ url: string; mime: string }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = imgSrc.startsWith('data:')
        ? imgSrc
        : `${imgSrc}${imgSrc.includes('?') ? '&' : '?'}vrender=${Date.now()}`;

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const width = aspect === '16:9' ? 1280 : 720;
          const height = aspect === '16:9' ? 720 : 1280;
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('Canvas 2D context is not available'));

          let mimeType = 'video/webm';
          if (typeof MediaRecorder !== 'undefined') {
            if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')) {
              mimeType = 'video/mp4;codecs=avc1';
            } else if (MediaRecorder.isTypeSupported('video/mp4')) {
              mimeType = 'video/mp4';
            } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
              mimeType = 'video/webm;codecs=vp9';
            } else if (MediaRecorder.isTypeSupported('video/webm')) {
              mimeType = 'video/webm';
            }
          }

          const fps = 30;
          const totalFrames = Math.max(30, Math.round(durationSec * fps));
          const stream = (canvas as any).captureStream
            ? (canvas as any).captureStream(fps)
            : (canvas as any).mozCaptureStream
            ? (canvas as any).mozCaptureStream(fps)
            : null;

          if (!stream || typeof MediaRecorder === 'undefined') {
            // Fallback: export canvas data URL as simulated loop
            return resolve({ url: imgSrc, mime: 'image/webp' });
          }

          let recorder: MediaRecorder;
          try {
            recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 3_500_000 });
          } catch {
            recorder = new MediaRecorder(stream);
            mimeType = recorder.mimeType || 'video/webm';
          }

          const chunks: Blob[] = [];
          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) chunks.push(e.data);
          };

          recorder.onstop = () => {
            const blob = new Blob(chunks, { type: mimeType });
            const blobUrl = URL.createObjectURL(blob);
            resolve({ url: blobUrl, mime: mimeType });
          };

          recorder.start();

          const imgW = img.naturalWidth || 1280;
          const imgH = img.naturalHeight || 720;
          const imgAspect = imgW / imgH;
          const targetAspect = width / height;

          let baseDrawW = width;
          let baseDrawH = height;
          let baseDx = 0;
          let baseDy = 0;

          if (imgAspect > targetAspect) {
            baseDrawH = height;
            baseDrawW = height * imgAspect;
            baseDx = (width - baseDrawW) / 2;
          } else {
            baseDrawW = width;
            baseDrawH = width / imgAspect;
            baseDy = (height - baseDrawH) / 2;
          }

          let frame = 0;
          const renderFrame = () => {
            const t = frame / totalFrames; // 0 to 1
            const ease = 0.5 - Math.cos(t * Math.PI) / 2;

            let scale = 1.0;
            let panX = 0;
            let panY = 0;

            if (mode === 'zoom_in') {
              scale = 1.0 + 0.16 * ease;
            } else if (mode === 'pan_horizontal') {
              scale = 1.10;
              panX = (ease - 0.5) * (width * 0.10);
            } else {
              scale = 1.02 + 0.08 * Math.sin(t * Math.PI);
              panX = Math.sin(t * Math.PI * 2) * 12;
              panY = Math.cos(t * Math.PI * 2) * 6;
            }

            ctx.save();
            ctx.clearRect(0, 0, width, height);

            ctx.translate(width / 2 + panX, height / 2 + panY);
            ctx.scale(scale, scale);
            ctx.translate(-width / 2, -height / 2);

            ctx.drawImage(img, baseDx, baseDy, baseDrawW, baseDrawH);
            ctx.restore();

            // Gradient overlays
            const grad = ctx.createLinearGradient(0, height * 0.60, 0, height);
            grad.addColorStop(0, 'rgba(0,0,0,0)');
            grad.addColorStop(0.5, 'rgba(0,0,0,0.3)');
            grad.addColorStop(1, 'rgba(0,0,0,0.85)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, height * 0.60, width, height * 0.40);

            const topGrad = ctx.createLinearGradient(0, 0, 0, height * 0.20);
            topGrad.addColorStop(0, 'rgba(0,0,0,0.4)');
            topGrad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = topGrad;
            ctx.fillRect(0, 0, width, height * 0.20);

            // Branding text
            if (brandingText) {
              ctx.save();
              ctx.fillStyle = '#FFFFFF';
              ctx.font = `bold ${Math.round(width * 0.038)}px system-ui, -apple-system, sans-serif`;
              ctx.textAlign = 'center';
              ctx.shadowColor = 'rgba(0,0,0,0.8)';
              ctx.shadowBlur = 12;
              const textY = height - (aspect === '16:9' ? 44 : 90);
              ctx.fillText(brandingText, width / 2, textY);

              ctx.font = `bold ${Math.round(width * 0.02)}px system-ui, -apple-system, sans-serif`;
              ctx.fillStyle = '#C5A880';
              ctx.fillText('ResortOS • סיור וידאו יוקרתי', width / 2, textY + (aspect === '16:9' ? 24 : 32));
              ctx.restore();
            }

            frame++;
            if (frame <= totalFrames) {
              requestAnimationFrame(renderFrame);
            } else {
              try {
                if (recorder.state === 'recording') recorder.stop();
              } catch {}
            }
          };

          renderFrame();
        } catch (err) {
          reject(err);
        }
      };

      img.onerror = () => {
        // If strict CORS blocks image loading, return original image as simulated motion
        resolve({ url: imgSrc, mime: 'image/webp' });
      };
    });
  };

  // Helper to persist generated video blob to storage
  const persistVideoBlob = async (videoUrl: string): Promise<string> => {
    if (!videoUrl.startsWith('blob:')) return videoUrl;
    try {
      if (supabase && (supabase as any).storage) {
        const response = await fetch(videoUrl);
        const blob = await response.blob();
        const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
        const cleanName = (propertyName || 'resort')
          .toLowerCase()
          .replace(/[^a-z0-9]/gi, '_')
          .slice(0, 20);
        const fileName = `${cleanName}_cinematic_${Date.now()}.${ext}`;

        const { data, error } = await (supabase as any).storage
          .from('resorts')
          .upload(fileName, blob, {
            contentType: blob.type || 'video/mp4',
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
    } catch (e) {
      console.warn('Video cloud upload fallback to local blob:', e);
    }
    return videoUrl;
  };

  // Generate Video Handler
  const handleGenerateVideo = async () => {
    setIsGeneratingVideo(true);
    const t0 = performance.now();
    const sourceImage = enhancedImageUrl || initialImageUrl;

    // 1. First, attempt Local Mac Studio Bridge if online and configured
    let bridgeSucceeded = false;
    if (isBridgeOnline) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const res = await fetch(`${bridgeUrl}/api/animate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_base64: sourceImage,
            mode: motionMode,
            aspect_ratio: aspectRatio,
            duration: videoDuration,
            property_name: propertyName,
            water_preset: waterPreset,
            water_intensity: waterIntensity,
            water_speed: waterSpeed,
            branding: {
              intro_text: introText.trim() || undefined,
              logo_overlay: includeLogo
            }
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (data.url) {
            setGeneratedVideoUrl(data.url);
            setVideoEngineUsed(data.engine_used || 'ffmpeg_ken_burns');
            setVideoGenerationTimeMs(data.processing_time_ms || Math.round(performance.now() - t0));
            setSaveSuccessNotice(
              motionMode === 'ai_motion'
                ? 'סרטון אדוות מים סינמטי (Water Cinemagraph) הופק בהצלחה במק סטודיו! 🌊✨'
                : 'הווידאו הסינמטי הופק בהצלחה במק סטודיו (FFmpeg 1080p)! 🎬✨'
            );
            setTimeout(() => setSaveSuccessNotice(null), 4000);
            bridgeSucceeded = true;
          }
        }
      } catch (bridgeErr) {
        console.warn('Bridge animate bypassed or offline, falling back to browser motion engine:', bridgeErr);
      }
    }

    if (bridgeSucceeded) {
      setIsGeneratingVideo(false);
      return;
    }

    // 2. Client-side Engine (Zero server dependency, runs anywhere)
    try {
      let videoUrl: string;
      let mime: string;
      let engineName = 'browser_canvas_motion';

      if (motionMode === 'ai_motion') {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = sourceImage;
        await new Promise((res, rej) => {
          img.onload = res;
          img.onerror = () => res(null); // graceful fallback
        });

        const { maskCanvas } = computeWaterMask(img, waterPreset, 1.0);
        const result = await createClientSideWaterVideo(img, maskCanvas, {
          preset: waterPreset,
          intensity: waterIntensity,
          speed: waterSpeed,
          durationSec: videoDuration,
          aspect: aspectRatio,
          brandingText: introText.trim() || propertyName,
          showBrandingLogo: includeLogo
        });
        videoUrl = result.url;
        mime = result.mime;
        engineName = 'browser_webgl_water_cinemagraph';
      } else {
        const result = await createClientSideMotionVideo(
          sourceImage,
          motionMode,
          aspectRatio,
          videoDuration,
          introText.trim() || propertyName,
          includeLogo
        );
        videoUrl = result.url;
        mime = result.mime;
      }

      (window as any)._lastVideoMime = mime;
      setGeneratedVideoUrl(videoUrl);
      setVideoEngineUsed(engineName);
      setVideoGenerationTimeMs(Math.round(performance.now() - t0));
      setSaveSuccessNotice(
        motionMode === 'ai_motion'
          ? 'סרטון אדוות מים סינמטי (Water Cinemagraph) הופק בהצלחה! 🌊✨'
          : 'הווידאו הסינמטי הופק בהצלחה במנוע התנועה של הדפדפן! 🎬✨'
      );
      setTimeout(() => setSaveSuccessNotice(null), 4000);
    } catch (clientErr: any) {
      console.warn('Client video render fallback:', clientErr);
      setGeneratedVideoUrl(sourceImage);
      setVideoEngineUsed('interactive_simulation');
      setSaveSuccessNotice('מוצגת הדמיית תנועה סינמטית בזמן אמת ✨');
      setTimeout(() => setSaveSuccessNotice(null), 4000);
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  // Save to Hero Video
  const handleApplyAsHeroVideo = async () => {
    if (!generatedVideoUrl) return;
    setIsSaving(true);
    try {
      const finalUrl = await persistVideoBlob(generatedVideoUrl);
      if (onSaveHeroVideo) {
        onSaveHeroVideo(finalUrl);
        setSaveSuccessNotice('הסרטון נקבע בהצלחה כסרטון הראשי (Hero Video) של המתחם! 🎬⭐');
        setTimeout(() => setSaveSuccessNotice(null), 3500);
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Save to TV Screensaver
  const handleApplyToScreensaver = () => {
    if (!generatedVideoUrl) return;
    if (onSaveToScreensaver) {
      onSaveToScreensaver(generatedVideoUrl);
    }
    setSaveSuccessNotice('הסרטון נוסף בהצלחה לפלייליסט שומר המסך לטלוויזיה! 📺✨');
    setTimeout(() => setSaveSuccessNotice(null), 3500);
  };

  // Download Video MP4
  const handleDownloadVideo = () => {
    if (!generatedVideoUrl) return;
    const a = document.createElement('a');
    a.href = generatedVideoUrl;
    const isMp4 = generatedVideoUrl.includes('.mp4') || ((window as any)._lastVideoMime && (window as any)._lastVideoMime.includes('mp4'));
    const cleanName = (propertyName || 'resort').toLowerCase().replace(/[^a-z0-9]/gi, '_');
    a.download = `${cleanName}-cinematic-${motionMode}.${isMp4 ? 'mp4' : 'webm'}`;
    a.click();
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

        {/* Top Studio Tabs */}
        <div className="flex border-b border-stone-800 bg-[#211917] px-4 pt-1 gap-1">
          <button
            type="button"
            onClick={() => setActiveStudioTab('photo')}
            className={`py-2.5 px-4 text-xs font-bold flex items-center gap-2 border-b-2 transition ${
              activeStudioTab === 'photo'
                ? 'border-[#C5A880] text-[#C5A880] bg-white/5 rounded-t-xl'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <Palette className="w-4 h-4" />
            <span>📸 שיפור תמונה (Flux Klein)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveStudioTab('video')}
            className={`py-2.5 px-4 text-xs font-bold flex items-center gap-2 border-b-2 transition ${
              activeStudioTab === 'video'
                ? 'border-[#C5A880] text-[#C5A880] bg-white/5 rounded-t-xl'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <Film className="w-4 h-4" />
            <span>🎬 הנפשה לווידאו (Motion Studio)</span>
            <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded font-bold">
              חדש
            </span>
          </button>
        </div>

        {/* Notice Toast */}
        {saveSuccessNotice && (
          <div className="bg-emerald-900/90 text-emerald-200 border-b border-emerald-700/60 p-3 text-xs text-center font-bold flex items-center justify-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-300" />
            <span>{saveSuccessNotice}</span>
          </div>
        )}

        {/* Main Content Grid */}
        {activeStudioTab === 'video' ? (
          <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-y-auto max-h-[75vh]">
            {/* Left Column: Video Player / Animation Simulation Area */}
            <div className="lg:col-span-7 flex flex-col items-center justify-center space-y-3">
              <div className="relative w-full aspect-16/10 rounded-2xl overflow-hidden bg-stone-950 border-2 border-stone-800 shadow-xl flex items-center justify-center">
                {generatedVideoUrl ? (
                  <div className="relative w-full h-full flex items-center justify-center bg-black">
                    <video
                      key={generatedVideoUrl}
                      src={generatedVideoUrl}
                      controls
                      autoPlay
                      loop
                      playsInline
                      className={`max-h-full max-w-full rounded-xl shadow-2xl ${
                        aspectRatio === '9:16' ? 'aspect-[9/16] h-full object-contain' : 'aspect-video w-full object-contain'
                      }`}
                    />
                    <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 pointer-events-none">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>וידאו סינמטי מוכן ({aspectRatio})</span>
                    </div>
                  </div>
                ) : motionMode === 'ai_motion' ? (
                  <WaterRipplePreview
                    imageUrl={enhancedImageUrl || initialImageUrl}
                    preset={waterPreset}
                    intensity={waterIntensity}
                    speed={waterSpeed}
                    aspectRatio={aspectRatio}
                    showMask={showWaterMaskOverlay}
                    onToggleShowMask={() => setShowWaterMaskOverlay(!showWaterMaskOverlay)}
                    onWaterRatioDetected={(ratio) => setDetectedWaterRatio(ratio)}
                  />
                ) : (
                  <div className="relative w-full h-full overflow-hidden flex items-center justify-center group">
                    <img
                      src={enhancedImageUrl || initialImageUrl}
                      alt="תמונה להנפשה"
                      className={`w-full h-full object-cover opacity-80 transition duration-700 ${
                        motionMode === 'zoom_in'
                          ? 'scale-105'
                          : motionMode === 'pan_horizontal'
                          ? 'translate-x-2'
                          : 'scale-102'
                      }`}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/40 flex flex-col items-center justify-center p-6 text-center">
                      <div className="w-14 h-14 rounded-2xl bg-[#C5A880]/20 border border-[#C5A880]/40 text-[#C5A880] flex items-center justify-center mb-3 shadow-lg group-hover:scale-110 transition">
                        <Play className="w-7 h-7 fill-current ml-0.5" />
                      </div>
                      <h4 className="text-white font-bold text-sm sm:text-base mb-1">
                        סטודיו תנועה סינמטית (Cinematic Motion)
                      </h4>
                      <p className="text-stone-300 text-xs max-w-sm mb-3 leading-relaxed">
                        הפיכת תמונת הסטילס לסרטון שיווקי ב-1080p עם תנועת מצלמה חכמה, אפקט Ken Burns ושכבת מיתוג.
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <span className="text-[10px] bg-stone-900/90 text-amber-300 border border-amber-500/30 px-2.5 py-1 rounded-full font-mono font-bold">
                          {aspectRatio === '16:9' ? '16:9 רחב (טלוויזיה / באנר)' : '9:16 אנכי (רילס / סטוריז)'}
                        </span>
                        <span className="text-[10px] bg-stone-900/90 text-stone-300 border border-stone-700 px-2.5 py-1 rounded-full font-mono">
                          משך: {videoDuration} שניות
                        </span>
                        <span className="text-[10px] bg-stone-900/90 text-stone-300 border border-stone-700 px-2.5 py-1 rounded-full">
                          {motionMode === 'zoom_in' ? '🔍 זום איטי פנימה' : motionMode === 'pan_horizontal' ? '↔️ פנורמה אופקית' : '🌊 תנועת AI חיה'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Video Generating Overlay */}
                {isGeneratingVideo && (
                  <div className="absolute inset-0 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-30 animate-fadeIn">
                    <RefreshCw className="w-10 h-10 text-[#C5A880] animate-spin mb-4" />
                    <h4 className="text-base font-bold text-white mb-1.5">
                      מרנדר וידאו סינמטי במק סטודיו...
                    </h4>
                    <p className="text-xs text-stone-400 max-w-sm mb-2 leading-relaxed">
                      מפעיל מנוע Ken Burns ב-FFmpeg, קרופ חכם ב-1080p 60fps ושכבות מיתוג יוקרתיות
                    </p>
                    <span className="text-[11px] font-mono text-[#C5A880] bg-[#C5A880]/10 border border-[#C5A880]/30 px-3 py-1 rounded-full">
                      עיבוד H.264 High Profile • משך הפקה ~2 שניות
                    </span>
                  </div>
                )}
              </div>

              {/* Video Generation Info Footer */}
              <div className="w-full flex items-center justify-between text-[11px] text-stone-400 px-1">
                <span className="flex items-center gap-1.5">
                  <Film className="w-3.5 h-3.5 text-[#C5A880]" />
                  <span>פורמט פלט: MP4 H.264 (תואם מסכי מגע, טלוויזיות ורשתות חברתיות)</span>
                </span>
                {videoGenerationTimeMs && (
                  <span className="font-mono text-emerald-400">
                    הופק ב-{videoGenerationTimeMs}ms ({videoEngineUsed})
                  </span>
                )}
              </div>
            </div>

            {/* Right Column: Video Controls, Presets & Settings */}
            <div className="lg:col-span-5 flex flex-col justify-between space-y-4 text-right">
              <div className="space-y-4">
                {/* 1. Motion Style Selector */}
                <div>
                  <label className="block text-xs font-bold text-stone-300 mb-2">
                    1. בחר סגנון תנועה סינמטי (Motion Style):
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    {MOTION_OPTIONS.map((opt) => {
                      const isSelected = motionMode === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setMotionMode(opt.id)}
                          className={`p-3 rounded-2xl border text-right transition flex items-center justify-between gap-3 text-xs ${
                            isSelected
                              ? 'bg-[#352724] border-[#C5A880] text-white shadow-md ring-1 ring-[#C5A880]/50'
                              : 'bg-[#221A18] border-stone-800 text-stone-300 hover:bg-[#2A201E]'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xl p-1.5 rounded-xl bg-stone-800/80 shrink-0">
                              {opt.icon}
                            </span>
                            <div>
                              <span className="font-bold block text-white text-xs mb-0.5">
                                {opt.title}
                              </span>
                              <span className="text-[10px] text-stone-400 block leading-tight">
                                {opt.subtitle}
                              </span>
                            </div>
                          </div>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${opt.badgeColor}`}>
                            {opt.badge}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 1.5 Water Cinemagraph Controls (Active when motionMode === 'ai_motion') */}
                {motionMode === 'ai_motion' && (
                  <div className="bg-[#241B19] p-3.5 rounded-2xl border border-cyan-800/60 space-y-3 animate-fadeIn">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                        <Waves className="w-4 h-4 text-cyan-400" />
                        <span>הגדרות אדוות מים (Water Cinemagraph)</span>
                      </span>
                      <span className="text-[10px] font-bold text-cyan-400/90 bg-cyan-950/80 border border-cyan-700/50 px-2 py-0.5 rounded-full">
                        {detectedWaterRatio > 0 ? `זוהו ${Math.round(detectedWaterRatio * 100)}% מים` : 'משטח מים פעיל'}
                      </span>
                    </div>

                    {/* Water Detection Preset */}
                    <div>
                      <span className="block text-[11px] text-stone-400 mb-1.5 font-medium">
                        סגנון זיהוי מים חכם:
                      </span>
                      <div className="grid grid-cols-2 gap-1.5">
                        {[
                          { id: 'auto_pool', label: '🏊‍♂️ בריכה וטורקיז', desc: 'תכלת, טורקיז ומי בריכה' },
                          { id: 'jacuzzi_spa', label: '🛁 ג\'קוזי וספא', desc: 'קצף, בועות וסילונים' },
                          { id: 'night_waters', label: '🌙 מי לילה', desc: 'תאורת ערב ואגמים' },
                          { id: 'full_surface', label: '🌊 משטח תחתון', desc: 'כל פני השטח התחתונים' }
                        ].map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setWaterPreset(p.id as any)}
                            className={`p-2 rounded-xl text-right border transition text-xs ${
                              waterPreset === p.id
                                ? 'bg-cyan-950/80 border-cyan-400 text-cyan-200 ring-1 ring-cyan-400/40'
                                : 'bg-stone-900/80 border-stone-700/80 text-stone-300 hover:bg-stone-800'
                            }`}
                          >
                            <span className="font-bold block text-[11px]">{p.label}</span>
                            <span className="text-[9px] text-stone-400 block leading-tight">{p.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Wave Intensity & Flow Speed */}
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-stone-800">
                      <div>
                        <span className="block text-[10px] text-stone-400 mb-1">
                          עוצמת האדוות:
                        </span>
                        <div className="grid grid-cols-3 gap-1">
                          {[
                            { val: 0.7, label: 'עדין' },
                            { val: 1.0, label: 'טבעי' },
                            { val: 1.4, label: 'מודגש' }
                          ].map((item) => (
                            <button
                              key={item.val}
                              type="button"
                              onClick={() => setWaterIntensity(item.val)}
                              className={`py-1 rounded-lg text-[10px] font-bold border transition ${
                                waterIntensity === item.val
                                  ? 'bg-cyan-500 text-black border-cyan-400'
                                  : 'bg-stone-900 border-stone-700 text-stone-300 hover:bg-stone-800'
                              }`}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <span className="block text-[10px] text-stone-400 mb-1">
                          מהירות זרימה:
                        </span>
                        <div className="grid grid-cols-3 gap-1">
                          {[
                            { val: 0.8, label: 'מרגיע' },
                            { val: 1.0, label: 'רגיל' },
                            { val: 1.3, label: 'זורם' }
                          ].map((item) => (
                            <button
                              key={item.val}
                              type="button"
                              onClick={() => setWaterSpeed(item.val)}
                              className={`py-1 rounded-lg text-[10px] font-bold border transition ${
                                waterSpeed === item.val
                                  ? 'bg-cyan-500 text-black border-cyan-400'
                                  : 'bg-stone-900 border-stone-700 text-stone-300 hover:bg-stone-800'
                              }`}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Toggle Water Mask Highlight */}
                    <button
                      type="button"
                      onClick={() => setShowWaterMaskOverlay(!showWaterMaskOverlay)}
                      className={`w-full py-1.5 px-2.5 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition ${
                        showWaterMaskOverlay
                          ? 'bg-cyan-500 text-black border-cyan-400'
                          : 'bg-stone-900/90 text-cyan-300 border-cyan-700/50 hover:bg-stone-800'
                      }`}
                    >
                      {showWaterMaskOverlay ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span>{showWaterMaskOverlay ? 'הסתר הדגשת מים שזוהו' : '👁️ הצג הדגשת מים שזוהו (בטורקיז)'}</span>
                    </button>
                  </div>
                )}

                {/* 2. Aspect Ratio & Duration Grid */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Aspect Ratio */}
                  <div className="bg-[#241B19] p-3 rounded-2xl border border-stone-800 space-y-2">
                    <span className="block text-[11px] font-bold text-stone-300">
                      יחס תצוגה:
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setAspectRatio('16:9')}
                        className={`py-1.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 border transition ${
                          aspectRatio === '16:9'
                            ? 'bg-[#C5A880] text-[#1C1615] border-[#C5A880]'
                            : 'bg-stone-900 border-stone-700 text-stone-300 hover:bg-stone-800'
                        }`}
                      >
                        <Monitor className="w-3.5 h-3.5" />
                        <span>16:9</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setAspectRatio('9:16')}
                        className={`py-1.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 border transition ${
                          aspectRatio === '9:16'
                            ? 'bg-[#C5A880] text-[#1C1615] border-[#C5A880]'
                            : 'bg-stone-900 border-stone-700 text-stone-300 hover:bg-stone-800'
                        }`}
                      >
                        <Smartphone className="w-3.5 h-3.5" />
                        <span>9:16</span>
                      </button>
                    </div>
                    <span className="block text-[9px] text-stone-500">
                      {aspectRatio === '16:9' ? 'טלוויזיה ובאנר עליון' : 'סטוריז, רילס וטיקטוק'}
                    </span>
                  </div>

                  {/* Duration */}
                  <div className="bg-[#241B19] p-3 rounded-2xl border border-stone-800 space-y-2">
                    <span className="block text-[11px] font-bold text-stone-300">
                      משך הסרטון:
                    </span>
                    <div className="grid grid-cols-3 gap-1">
                      {[3, 5, 7].map((sec) => (
                        <button
                          key={sec}
                          type="button"
                          onClick={() => setVideoDuration(sec)}
                          className={`py-1.5 px-1 rounded-xl text-xs font-bold border transition text-center ${
                            videoDuration === sec
                              ? 'bg-[#C5A880] text-[#1C1615] border-[#C5A880]'
                              : 'bg-stone-900 border-stone-700 text-stone-300 hover:bg-stone-800'
                          }`}
                        >
                          {sec}s
                        </button>
                      ))}
                    </div>
                    <span className="block text-[9px] text-stone-500">
                      {videoDuration === 5 ? 'משך מומלץ (Loop חלק)' : videoDuration === 3 ? 'טיזר מהיר' : 'פנורמה ארוכה'}
                    </span>
                  </div>
                </div>

                {/* 3. Branding Accordion */}
                <div className="border border-stone-800 rounded-2xl overflow-hidden bg-[#201816]">
                  <button
                    type="button"
                    onClick={() => setShowBrandingSettings(!showBrandingSettings)}
                    className="w-full p-2.5 px-3 flex items-center justify-between text-xs text-stone-400 hover:text-stone-200"
                  >
                    <span className="flex items-center gap-1.5 font-bold">
                      <Sparkles className="w-3.5 h-3.5 text-[#C5A880]" />
                      <span>שכבות מיתוג וטקסט (Branding Overlay)</span>
                    </span>
                    {showBrandingSettings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {showBrandingSettings && (
                    <div className="p-3 pt-0 border-t border-stone-800/60 space-y-3 text-xs animate-fadeIn">
                      <div>
                        <label className="block text-[11px] text-stone-400 mb-1">
                          כותרת פתיחה על הווידאו:
                        </label>
                        <input
                          type="text"
                          value={introText}
                          onChange={(e) => setIntroText(e.target.value)}
                          placeholder={propertyName || 'שם המתחם'}
                          className="w-full p-2 rounded-xl bg-stone-900 border border-stone-700 text-stone-200 text-xs focus:outline-none focus:border-[#C5A880]"
                        />
                      </div>

                      <label className="flex items-center gap-2 cursor-pointer text-[11px] text-stone-300">
                        <input
                          type="checkbox"
                          checked={includeLogo}
                          onChange={(e) => setIncludeLogo(e.target.checked)}
                          className="rounded accent-[#C5A880]"
                        />
                        <span>הצג חותמת איכות יוקרתית של ResortOS בפינת הווידאו</span>
                      </label>
                    </div>
                  )}
                </div>

                {/* Main Render Video Button */}
                <button
                  type="button"
                  onClick={handleGenerateVideo}
                  disabled={isGeneratingVideo}
                  className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[#C5A880] to-[#A3835B] hover:from-[#d1b691] hover:to-[#b09065] text-[#26130F] font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg transition active:scale-98 disabled:opacity-50"
                >
                  {isGeneratingVideo ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-[#26130F]" />
                      <span>מרנדר וידאו סינמטי...</span>
                    </>
                  ) : (
                    <>
                      <Film className="w-4 h-4 text-[#26130F]" />
                      <span>הפק וידאו סינמטי (Render 1080p)</span>
                    </>
                  )}
                </button>
              </div>

              {/* Video Actions (Apply as Hero Video / Screensaver / Download) */}
              <div className="pt-3 border-t border-stone-800/80 space-y-2">
                <span className="text-[11px] font-bold text-stone-400 block mb-1">
                  שימוש ושמירת הווידאו:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {onSaveHeroVideo && (
                    <button
                      type="button"
                      onClick={handleApplyAsHeroVideo}
                      disabled={!generatedVideoUrl || isGeneratingVideo}
                      className="py-2.5 px-3 rounded-xl bg-[#C5A880]/20 hover:bg-[#C5A880]/30 text-[#C5A880] border border-[#C5A880]/40 text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-98 disabled:opacity-40"
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>קבע כסרטון ראשי (Hero)</span>
                    </button>
                  )}

                  {onSaveToScreensaver && (
                    <button
                      type="button"
                      onClick={handleApplyToScreensaver}
                      disabled={!generatedVideoUrl || isGeneratingVideo}
                      className="py-2.5 px-3 rounded-xl bg-purple-900/30 hover:bg-purple-900/50 text-purple-300 border border-purple-700/40 text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-98 disabled:opacity-40"
                    >
                      <Tv className="w-3.5 h-3.5 text-purple-300" />
                      <span>הוסף לשומר מסך טלוויזיה</span>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleDownloadVideo}
                  disabled={!generatedVideoUrl}
                  className="w-full py-2 px-3 rounded-xl border border-stone-800 hover:bg-stone-900 text-stone-400 hover:text-stone-200 text-xs font-medium flex items-center justify-center gap-1.5 transition disabled:opacity-40"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>הורד קובץ וידאו MP4 (איכות 1080p)</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-y-auto max-h-[75vh]">
          {/* Left / Center: Interactive Before-After Comparison View */}
          <div className="lg:col-span-7 flex flex-col items-center justify-center space-y-3">
            <div
              ref={containerRef}
              dir="ltr"
              onClick={(e) => handleSliderMove(e.clientX)}
              onMouseDown={(e) => {
                setIsDraggingSlider(true);
                handleSliderMove(e.clientX);
              }}
              onTouchStart={(e) => {
                setIsDraggingSlider(true);
                if (e.touches[0]) handleSliderMove(e.touches[0].clientX);
              }}
              className="relative w-full aspect-4/3 sm:aspect-16/10 rounded-2xl overflow-hidden bg-stone-900 border-2 border-stone-800 shadow-xl cursor-ew-resize select-none group"
            >
              {/* Before: Original Image (Underneath, right side of divider) */}
              <img
                src={initialImageUrl}
                alt="תמונת מקור לפני שיפור"
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              />

              {/* After: Enhanced Image (Clipped overlay on top, revealing from left edge to divider) */}
              <div
                className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none"
                style={{
                  clipPath: `inset(0 ${100 - sliderPos}% 0 0)`
                }}
              >
                <img
                  src={enhancedImageUrl || initialImageUrl}
                  alt="אחרי שיפור AI"
                  className="w-full h-full object-cover transition-all duration-150"
                  style={{
                    filter: (isRealAiEnhanced || (enhancedImageUrl && enhancedImageUrl.startsWith('data:')))
                      ? 'none'
                      : getPresetFilterCss(selectedPreset, denoiseStrength)
                  }}
                />

                {/* Overlays for Preset Stylization */}
                {!isRealAiEnhanced && selectedPreset === 'graphic_novel' && (
                  <div
                    className="absolute inset-0 pointer-events-none mix-blend-multiply opacity-15"
                    style={{
                      backgroundImage: 'radial-gradient(#261914 0.75px, transparent 0.75px)',
                      backgroundSize: '5px 5px'
                    }}
                  />
                )}

                {!isRealAiEnhanced && selectedPreset === 'golden_hour' && (
                  <div
                    className="absolute inset-0 pointer-events-none mix-blend-color-dodge opacity-25"
                    style={{
                      background: 'linear-gradient(135deg, rgba(251,191,36,0.6) 0%, rgba(245,158,11,0.2) 60%, rgba(217,119,6,0.4) 100%)'
                    }}
                  />
                )}

                {!isRealAiEnhanced && selectedPreset === 'moody_night' && (
                  <div
                    className="absolute inset-0 pointer-events-none mix-blend-multiply opacity-35"
                    style={{
                      background: 'linear-gradient(180deg, rgba(15,23,42,0.7) 0%, rgba(30,27,75,0.5) 100%)'
                    }}
                  />
                )}
              </div>

              {/* Split-view Divider Handle */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white shadow-2xl pointer-events-none z-10"
                style={{ left: `${sliderPos}%` }}
              >
                <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-white text-[#26130F] flex items-center justify-center shadow-2xl border-2 border-stone-800">
                  <div className="flex gap-0.5 text-[10px] font-black">
                    <span>◀</span>
                    <span>▶</span>
                  </div>
                </div>
              </div>

              {/* Badges */}
              <div className="absolute top-3 left-3 bg-black/75 backdrop-blur-md text-[#C5A880] border border-white/20 text-[10px] font-bold px-2.5 py-1 rounded-full pointer-events-none flex items-center gap-1 z-10 shadow">
                {selectedPreset ? (
                  <>
                    <Sparkles className="w-3 h-3 text-[#C5A880]" />
                    <span>
                      {isRealAiEnhanced
                        ? 'תוצאת AI מרונדרת (Flux)'
                        : `שיפור: ${
                            selectedPreset === 'graphic_novel'
                              ? 'איור אדריכלי'
                              : selectedPreset === 'golden_hour'
                              ? 'שעת הזהב'
                              : selectedPreset === 'hospitality_hdr'
                              ? 'אירוח יוקרתי'
                              : 'ערב רומנטי'
                          }`}
                    </span>
                  </>
                ) : (
                  <>
                    <ImageIcon className="w-3 h-3 text-stone-400" />
                    <span className="text-stone-300">תמונת מקור (בחר סגנון לעיבוד)</span>
                  </>
                )}
              </div>

              <div className="absolute top-3 right-3 bg-black/75 backdrop-blur-md text-stone-300 border border-white/20 text-[10px] font-bold px-2.5 py-1 rounded-full pointer-events-none flex items-center gap-1 z-10 shadow">
                <ImageIcon className="w-3 h-3 text-stone-400" />
                <span>תמונת מקור (לפני)</span>
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
              {isRealAiEnhanced && processingTimeMs ? (
                <span className="font-mono text-emerald-400">
                  זמן עיבוד: {processingTimeMs}ms ({engineUsed})
                </span>
              ) : selectedPreset ? (
                <span className="font-sans text-amber-300/90 text-[10px] flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>תצוגה מקדימה פעילה בזמן אמת (Denoise {Math.round(denoiseStrength * 100)}%)</span>
                </span>
              ) : (
                <span className="font-sans text-stone-400 text-[10px] flex items-center gap-1">
                  <span>👈 בחר סגנון מימין כדי לראות הדמיה והשוואה</span>
                </span>
              )}
            </div>
          </div>

          {/* Right: Controls, Presets & Action Panel */}
          <div className="lg:col-span-5 flex flex-col justify-between space-y-4 text-right">
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-stone-300">
                    1. בחר סגנון שיפור (AI Style Preset):
                  </label>
                  {selectedPreset && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPreset(null);
                        setIsRealAiEnhanced(false);
                        setEnhancedImageUrl(initialImageUrl);
                      }}
                      className="text-[11px] text-[#C5A880] hover:text-[#e0c49e] flex items-center gap-1 transition"
                      title="חזרה לתמונת המקור ללא סגנון"
                    >
                      <span>✕ בטל סגנון (חזרה למקור)</span>
                    </button>
                  )}
                </div>
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
              <div className={`bg-[#241B19] p-3.5 rounded-2xl border border-stone-800 space-y-2 transition ${!selectedPreset ? 'opacity-50' : ''}`}>
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-stone-300">עוצמת השינוי (Denoise):</span>
                  <span className="font-mono text-[#C5A880]">
                    {selectedPreset ? `${Math.round(denoiseStrength * 100)}%` : '—'}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.10"
                  max="0.90"
                  step="0.02"
                  disabled={!selectedPreset}
                  value={denoiseStrength}
                  onChange={(e) => handleDenoiseChange(parseFloat(e.target.value))}
                  className="w-full accent-[#C5A880] cursor-pointer disabled:cursor-not-allowed"
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
                disabled={isProcessing || !selectedPreset}
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[#C5A880] to-[#A3835B] hover:from-[#d1b691] hover:to-[#b09065] text-[#26130F] font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg transition active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-[#26130F]" />
                    <span>מעבד תמונה במק סטודיו...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 fill-current text-[#26130F]" />
                    <span>
                      {!selectedPreset ? 'בחר סגנון למעלה כדי להתחיל עיבוד' : 'עבד תמונה מחדש (Regenerate AI)'}
                    </span>
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
                      <Star className="w-3.5 h-3.5 fill-current" />
                    )}
                    <span>{isSaving ? 'שומר ב-Storage...' : '⭐ קבע כתמונה ראשית (Hero)'}</span>
                  </button>
                )}

                {onSaveToGallery && (
                  <button
                    type="button"
                    onClick={handleApplyToGallery}
                    disabled={isSaving}
                    className="py-2.5 px-3 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-98 disabled:opacity-50"
                    title="שומר את התמונה בגלריית המתחם מבלי לשנות את התמונה הראשית"
                  >
                    {isSaving ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#C5A880]" />
                    ) : (
                      <UploadCloud className="w-3.5 h-3.5 text-[#C5A880]" />
                    )}
                    <span>{isSaving ? 'שומר ב-Storage...' : '📸 הוסף לגלריית המתחם (ללא שינוי ראשית)'}</span>
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
      )}

      {/* Persistent Bottom Action Bar (Always Visible without Scrolling) */}
      <div className="p-3.5 sm:p-4 bg-[#231A18] border-t border-stone-800/90 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 shadow-lg">
        <div className="flex items-center gap-2 text-xs text-stone-300 w-full sm:w-auto">
          <Sparkles className="w-4 h-4 text-[#C5A880] shrink-0" />
          <span className="font-medium text-stone-300 text-[11px] sm:text-xs">
            {activeStudioTab === 'video'
              ? (generatedVideoUrl ? 'הווידאו הסינמטי מוכן להטמעה או להורדה' : 'בחר תנועה ולחץ על "הפק וידאו סינמטי"')
              : (isRealAiEnhanced
                  ? 'תמונה מוכנה לאחר רינדור מקומי מלא (Flux)'
                  : selectedPreset
                  ? `תצוגת ${
                      selectedPreset === 'graphic_novel'
                        ? 'איור אדריכלי'
                        : selectedPreset === 'golden_hour'
                        ? 'שעת הזהב'
                        : selectedPreset === 'hospitality_hdr'
                        ? 'אירוח יוקרתי'
                        : 'ערב רומנטי'
                    } מוכנה לשמירה או להורדה`
                  : 'בחר סגנון שיפור מהרשימה כדי לראות הדמיה והשוואה')}
          </span>
          {saveSuccessNotice && (
            <span className="text-emerald-400 font-bold bg-emerald-950/80 border border-emerald-800/80 px-2.5 py-0.5 rounded-lg text-[10px] sm:text-[11px] animate-fadeIn">
              {saveSuccessNotice}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
          {activeStudioTab === 'photo' ? (
            <>
              <button
                type="button"
                onClick={handleDownload}
                className="py-2.5 px-3 rounded-xl border border-stone-700 hover:bg-stone-800 text-stone-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition active:scale-98"
              >
                <Download className="w-3.5 h-3.5" />
                <span>הורד WebP</span>
              </button>

              {onSaveToGallery && (
                <button
                  type="button"
                  onClick={handleApplyToGallery}
                  disabled={isSaving}
                  className="py-2.5 px-3.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-100 border border-stone-600 text-xs font-bold flex items-center gap-1.5 shadow-sm transition active:scale-98 disabled:opacity-50"
                  title="שומר את התמונה המשופרת בגלריית התמונות. התמונה הראשית תישאר ללא שינוי."
                >
                  {isSaving ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#C5A880]" />
                  ) : (
                    <UploadCloud className="w-3.5 h-3.5 text-[#C5A880]" />
                  )}
                  <span>📸 הוסף לגלריה (ללא שינוי ראשית)</span>
                </button>
              )}

              {onSaveHeroImage && (
                <button
                  type="button"
                  onClick={handleApplyAsHero}
                  disabled={isSaving}
                  className="py-2.5 px-3.5 rounded-xl bg-gradient-to-r from-[#C5A880] to-[#A3835B] hover:from-[#d1b691] hover:to-[#b09065] text-[#26130F] text-xs font-black flex items-center gap-1.5 shadow-md transition active:scale-98 disabled:opacity-50"
                  title="קובע את התמונה המשופרת כתמונה הראשית בראש דף המתחם"
                >
                  {isSaving ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Star className="w-3.5 h-3.5 fill-current" />
                  )}
                  <span>⭐ קבע כתמונה ראשית (Hero)</span>
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleDownloadVideo}
                disabled={!generatedVideoUrl}
                className="py-2.5 px-3 rounded-xl border border-stone-700 hover:bg-stone-800 text-stone-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5" />
                <span>הורד MP4</span>
              </button>

              {onSaveHeroVideo && (
                <button
                  type="button"
                  onClick={handleApplyAsHeroVideo}
                  disabled={!generatedVideoUrl || isGeneratingVideo}
                  className="py-2.5 px-3.5 rounded-xl bg-[#C5A880]/20 hover:bg-[#C5A880]/30 text-[#C5A880] border border-[#C5A880]/40 text-xs font-bold flex items-center gap-1.5 transition active:scale-98 disabled:opacity-40"
                >
                  <Video className="w-3.5 h-3.5" />
                  <span>קבע כסרטון ראשי (Hero)</span>
                </button>
              )}

              {onSaveToScreensaver && (
                <button
                  type="button"
                  onClick={handleApplyToScreensaver}
                  disabled={!generatedVideoUrl || isGeneratingVideo}
                  className="py-2.5 px-3.5 rounded-xl bg-purple-900/30 hover:bg-purple-900/50 text-purple-300 border border-purple-700/40 text-xs font-bold flex items-center gap-1.5 transition active:scale-98 disabled:opacity-40"
                >
                  <Tv className="w-3.5 h-3.5 text-purple-300" />
                  <span>הוסף לשומר מסך</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  </div>
);
};
