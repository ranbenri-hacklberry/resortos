import React, { useEffect, useRef, useState } from 'react';
import {
  computeWaterMask,
  createWaterRippleRenderer,
  WaterDetectionPreset,
  WaterRippleRenderer
} from './waterRippleEngine';
import { Eye, EyeOff, Play, Pause, Waves } from 'lucide-react';

interface WaterRipplePreviewProps {
  imageUrl: string;
  preset: WaterDetectionPreset;
  intensity: number; // 0.5 to 2.0
  speed: number;     // 0.5 to 2.0
  aspectRatio: '16:9' | '9:16';
  showMask: boolean;
  onToggleShowMask: () => void;
  onWaterRatioDetected?: (ratio: number) => void;
}

export const WaterRipplePreview: React.FC<WaterRipplePreviewProps> = ({
  imageUrl,
  preset,
  intensity,
  speed,
  aspectRatio,
  showMask,
  onToggleShowMask,
  onWaterRatioDetected
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WaterRippleRenderer | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [detectedRatio, setDetectedRatio] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl.startsWith('data:')
      ? imageUrl
      : `${imageUrl}${imageUrl.includes('?') ? '&' : '?'}vpreview=${Date.now()}`;

    img.onload = () => {
      if (isCancelled || !canvasRef.current) return;

      const canvas = canvasRef.current;
      const w = aspectRatio === '16:9' ? 1280 : 720;
      const h = aspectRatio === '16:9' ? 720 : 1280;
      canvas.width = w;
      canvas.height = h;

      // 1. Compute smart water mask
      const { maskCanvas, waterRatio } = computeWaterMask(img, preset, 1.0);
      setDetectedRatio(waterRatio);
      if (onWaterRatioDetected) {
        onWaterRatioDetected(waterRatio);
      }

      // 2. Destroy previous renderer if any
      if (rendererRef.current) {
        rendererRef.current.destroy();
        rendererRef.current = null;
      }

      // 3. Initialize WebGL water ripple renderer
      const renderer = createWaterRippleRenderer(canvas, img, maskCanvas);
      rendererRef.current = renderer;
      setIsLoading(false);

      if (!renderer) return;

      // 4. Start 60fps animation loop
      const startTime = performance.now();
      const cycleMs = 5000; // 5 second loop

      const loop = () => {
        if (isCancelled) return;
        if (isPlaying && rendererRef.current) {
          const elapsed = performance.now() - startTime;
          const t = (elapsed % cycleMs) / cycleMs; // 0.0 to 1.0
          rendererRef.current.render(t, intensity, speed, showMask);
        }
        animFrameIdRef.current = requestAnimationFrame(loop);
      };

      animFrameIdRef.current = requestAnimationFrame(loop);
    };

    img.onerror = () => {
      if (!isCancelled) setIsLoading(false);
    };

    return () => {
      isCancelled = true;
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
      if (rendererRef.current) {
        rendererRef.current.destroy();
        rendererRef.current = null;
      }
    };
  }, [imageUrl, preset, aspectRatio]);

  // Update intensity, speed and showMask in real-time
  useEffect(() => {
    if (rendererRef.current && !isPlaying) {
      rendererRef.current.render(0.5, intensity, speed, showMask);
    }
  }, [intensity, speed, showMask, isPlaying]);

  const waterPct = Math.round(detectedRatio * 100);

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden select-none">
      <canvas
        ref={canvasRef}
        className={`max-h-full max-w-full rounded-xl shadow-2xl object-contain ${
          aspectRatio === '9:16' ? 'aspect-[9/16] h-full' : 'aspect-video w-full'
        }`}
      />

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-stone-950/80 flex flex-col items-center justify-center gap-2 z-10">
          <Waves className="w-8 h-8 text-[#C5A880] animate-bounce" />
          <span className="text-xs text-stone-300 font-bold">
            מנתח משטחי מים ומכין מנוע אדוות חי...
          </span>
        </div>
      )}

      {/* Top Left: Live Status Badge */}
      <div className="absolute top-3 left-3 bg-black/75 backdrop-blur-md border border-cyan-500/40 text-cyan-300 text-[10px] font-bold px-3 py-1.5 rounded-full flex items-center gap-2 shadow-lg">
        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping shrink-0" />
        <span>תצוגת אדוות מים חיה • {waterPct > 0 ? `${waterPct}% שטח מים מזוהה` : 'משטח מים פעיל'}</span>
      </div>

      {/* Bottom Bar Controls for Live Preview */}
      <div className="absolute bottom-3 inset-x-3 flex items-center justify-between pointer-events-none">
        {/* Play/Pause Button */}
        <button
          type="button"
          onClick={() => setIsPlaying(!isPlaying)}
          className="pointer-events-auto bg-stone-900/85 hover:bg-stone-800 text-stone-200 hover:text-white border border-stone-700/80 px-2.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow-md backdrop-blur-sm transition active:scale-95"
          title={isPlaying ? 'עצור אנימציה' : 'הפעל אנימציה'}
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5 text-amber-400" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
          <span>{isPlaying ? 'השהה' : 'נגן'}</span>
        </button>

        {/* Mask Overlay Toggle Button */}
        <button
          type="button"
          onClick={onToggleShowMask}
          className={`pointer-events-auto px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md backdrop-blur-sm border transition active:scale-95 ${
            showMask
              ? 'bg-cyan-500 text-black border-cyan-400 shadow-cyan-500/30'
              : 'bg-stone-900/85 hover:bg-stone-800 text-cyan-300 border-cyan-500/40'
          }`}
          title="הדגש בצבע טורקיז את אזור המים שזוהה"
        >
          {showMask ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          <span>{showMask ? 'הסתר אזור שזוהה' : 'הצג אזור מים שזוהה'}</span>
        </button>
      </div>
    </div>
  );
};
