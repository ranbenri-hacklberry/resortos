/**
 * ResortOS Water Ripple & Cinemagraph Engine
 * High-performance WebGL & Canvas shader pipeline that animates realistic water ripples,
 * waves and specular caustics on still images while keeping architectural surroundings perfectly static.
 */

export type WaterDetectionPreset = 'auto_pool' | 'jacuzzi_spa' | 'night_waters' | 'full_surface';

export interface WaterMaskResult {
  maskCanvas: HTMLCanvasElement;
  waterRatio: number;
}

export interface WaterRenderOptions {
  preset: WaterDetectionPreset;
  intensity: number; // 0.5 to 2.0 (default 1.0)
  speed: number;     // 0.5 to 2.0 (default 1.0)
  showMask?: boolean;
}

export interface WaterVideoRenderOptions extends WaterRenderOptions {
  durationSec: number;
  aspect: '16:9' | '9:16';
  brandingText?: string;
  showBrandingLogo?: boolean;
}

/**
 * Computes an adaptive, feathered water mask from an image using HSV analysis
 * and spatial priors tailored to luxury resort swimming pools, jacuzzis and water surfaces.
 */
export function computeWaterMask(
  img: HTMLImageElement,
  preset: WaterDetectionPreset = 'auto_pool',
  sensitivity: number = 1.0
): WaterMaskResult {
  const maskW = 640;
  const naturalW = img.naturalWidth || 1280;
  const naturalH = img.naturalHeight || 720;
  const maskH = Math.round(maskW * (naturalH / naturalW));

  // Step 1: Draw source to temp canvas to extract RGB buffer
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = maskW;
  sampleCanvas.height = maskH;
  const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
  if (!sampleCtx) {
    return { maskCanvas: sampleCanvas, waterRatio: 0 };
  }

  sampleCtx.drawImage(img, 0, 0, maskW, maskH);
  const imgData = sampleCtx.getImageData(0, 0, maskW, maskH);
  const data = imgData.data;

  // Step 2: Compute per-pixel water confidence (0 to 255)
  const rawMaskCanvas = document.createElement('canvas');
  rawMaskCanvas.width = maskW;
  rawMaskCanvas.height = maskH;
  const rawMaskCtx = rawMaskCanvas.getContext('2d')!;
  const maskImgData = rawMaskCtx.createImageData(maskW, maskH);
  const maskPixels = maskImgData.data;

  let waterPixelCount = 0;
  const totalPixels = maskW * maskH;

  for (let y = 0; y < maskH; y++) {
    const yRatio = y / maskH; // 0.0 (top) to 1.0 (bottom)
    for (let x = 0; x < maskW; x++) {
      const idx = (y * maskW + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Convert RGB to HSV
      const maxVal = Math.max(r, g, b);
      const minVal = Math.min(r, g, b);
      const delta = maxVal - minVal;

      let hue = 0;
      if (delta > 0) {
        if (maxVal === r) {
          hue = ((g - b) / delta) % 6;
        } else if (maxVal === g) {
          hue = (b - r) / delta + 2;
        } else {
          hue = (r - g) / delta + 4;
        }
        hue *= 60;
        if (hue < 0) hue += 360;
      }
      const sat = maxVal === 0 ? 0 : delta / maxVal;
      const val = maxVal / 255;

      let isWater = 0;

      if (preset === 'full_surface') {
        // Lower surface mode (animates whatever surface is at the bottom 55% of the frame)
        if (yRatio > 0.40) {
          const depthRamp = Math.min(1.0, (yRatio - 0.40) / 0.12);
          isWater = Math.round(255 * depthRamp);
        }
      } else if (preset === 'night_waters') {
        // Night pool / artistic illumination mode (purple/magenta/green pool lights + dark waters)
        if (yRatio > 0.20) {
          const depthRamp = Math.min(1.0, (yRatio - 0.20) / 0.15);
          const isColoredPool = (sat > 0.22 && (hue > 140 && hue < 320)) || (val < 0.35 && b >= r && yRatio > 0.45);
          if (isColoredPool) {
            isWater = Math.round(255 * depthRamp);
          }
        }
      } else if (preset === 'jacuzzi_spa') {
        // Jacuzzi / hot tub mode (cyan/aqua + white aerated bubbles/specular foam)
        if (yRatio > 0.20) {
          const depthRamp = Math.min(1.0, (yRatio - 0.20) / 0.12);
          const isBlueCyan = (hue >= 145 && hue <= 255) && sat >= (0.10 / sensitivity);
          const isWhiteFoam = val > 0.70 && sat < 0.35 && b >= r - 10 && yRatio > 0.32;
          if (isBlueCyan || isWhiteFoam) {
            isWater = Math.round(255 * depthRamp);
          }
        }
      } else {
        // Default: 'auto_pool' (Standard hotel/resort swimming pools, infinity pools & sea)
        // High confidence on cyan/turquoise/cerulean/deep blue hues
        if (yRatio > 0.18) {
          const depthRamp = Math.min(1.0, (yRatio - 0.18) / 0.14);
          const isHueWater = hue >= 140 && hue <= 250;
          const isBlueDominant = (b > r * 1.06 || (b + g) > r * 2.1) && b > 40;
          const isSatValid = sat >= (0.12 / sensitivity);

          if (isHueWater && isBlueDominant && isSatValid) {
            isWater = Math.round(255 * depthRamp);
          } else if (b > 85 && b > r + 18 && b >= g - 12 && yRatio > 0.25) {
            isWater = Math.round(255 * depthRamp);
          }
        }
      }

      if (isWater > 120) {
        waterPixelCount++;
      }

      maskPixels[idx] = isWater;
      maskPixels[idx + 1] = isWater;
      maskPixels[idx + 2] = isWater;
      maskPixels[idx + 3] = 255;
    }
  }

  rawMaskCtx.putImageData(maskImgData, 0, 0);

  // Step 3: Feather mask edges with blur so boundary transitions between pool and coping are silky smooth
  const smoothedCanvas = document.createElement('canvas');
  smoothedCanvas.width = maskW;
  smoothedCanvas.height = maskH;
  const smoothCtx = smoothedCanvas.getContext('2d')!;
  smoothCtx.filter = 'blur(8px)';
  smoothCtx.drawImage(rawMaskCanvas, 0, 0);

  const waterRatio = waterPixelCount / totalPixels;
  return { maskCanvas: smoothedCanvas, waterRatio };
}

// GLSL Vertex Shader
const VS_SOURCE = `
attribute vec2 a_position;
varying vec2 v_uv;

void main() {
  v_uv = (a_position + 1.0) * 0.5;
  v_uv.y = 1.0 - v_uv.y; // Flip Y for WebGL texture coordinate system
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// GLSL Fragment Shader for Multi-Frequency Cinemagraph Water Ripples + Caustics
const FS_SOURCE = `
precision mediump float;
uniform sampler2D u_image;
uniform sampler2D u_mask;
uniform float u_time;        // 0.0 to 1.0
uniform float u_intensity;   // Wave amplitude multiplier (0.5 to 2.0)
uniform float u_speed;       // Wave speed multiplier (0.5 to 2.0)
uniform int u_show_mask;     // 1 to render visual mask debug overlay

varying vec2 v_uv;

void main() {
  vec2 uv = v_uv;
  float mask = texture2D(u_mask, uv).r;

  // Debug mode: highlight detected water with translucent luxury turquoise overlay
  if (u_show_mask == 1) {
    vec4 base = texture2D(u_image, uv);
    vec4 cyanGlow = vec4(0.0, 0.88, 0.95, 1.0);
    gl_FragColor = mix(base, mix(base, cyanGlow, 0.52), mask);
    return;
  }

  // Non-water area stays 100% steady and motionless (Cinemagraph effect)
  if (mask <= 0.008) {
    gl_FragColor = texture2D(u_image, uv);
    return;
  }

  float t = u_time * 6.28318530718 * u_speed;

  // Perspective factor: ripples are larger and have greater amplitude towards bottom (foreground)
  float persp = mix(0.40, 1.0, uv.y);

  // Multi-frequency harmonic water wave superposition
  // Wave 1: primary gentle lateral swell
  float wave1 = sin(uv.y * 34.0 - t + uv.x * 12.0);
  // Wave 2: diagonal cross-ripples
  float wave2 = cos(uv.y * 58.0 + t * 1.5 - uv.x * 22.0);
  // Wave 3: micro surface tension ripple
  float wave3 = sin((uv.x + uv.y) * 88.0 - t * 0.8);

  // 2D displacement vector scaled by perspective, intensity and smooth mask boundary
  vec2 displacement = vec2(
    (wave1 * 0.0034 + wave2 * 0.0018) * persp * u_intensity,
    (wave1 * 0.0052 + wave3 * 0.0024) * persp * u_intensity
  ) * mask;

  vec2 sampleUv = clamp(uv + displacement, 0.0, 1.0);
  vec4 color = texture2D(u_image, sampleUv);

  // Specular reflection caustics (sunlight / pool-light glistening along wave crests)
  float crest = max(0.0, wave1 * 0.65 + wave2 * 0.35);
  float glint = pow(crest, 2.8) * 0.13 * persp * u_intensity * mask;

  // Subtle aquatic color shimmer on crests
  color.rgb += vec3(glint * 0.85, glint * 1.0, glint * 1.15);

  gl_FragColor = color;
}
`;

export interface WaterRippleRenderer {
  render: (time0to1: number, intensity?: number, speed?: number, showMask?: boolean) => void;
  updateMask: (newMaskCanvas: HTMLCanvasElement) => void;
  destroy: () => void;
}

/**
 * Initializes a WebGL water ripple renderer on any HTMLCanvasElement.
 */
export function createWaterRippleRenderer(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  maskCanvas: HTMLCanvasElement
): WaterRippleRenderer | null {
  const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, alpha: false }) ||
    canvas.getContext('experimental-webgl', { preserveDrawingBuffer: true, alpha: false });

  if (!gl) {
    console.warn('WebGL not supported for water ripple engine, falling back to 2D.');
    return null;
  }

  // Compile shaders
  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vs, VS_SOURCE);
  gl.compileShader(vs);

  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fs, FS_SOURCE);
  gl.compileShader(fs);

  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('WebGL Program link error:', gl.getProgramInfoLog(program));
    return null;
  }

  gl.useProgram(program);

  // Set up screen-filling quad geometry
  const posBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,
     1, -1,
    -1,  1,
    -1,  1,
     1, -1,
     1,  1
  ]), gl.STATIC_DRAW);

  const aPosition = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(aPosition);
  gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

  // Create & bind Image Texture (Unit 0)
  const imageTexture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, imageTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

  // Create & bind Mask Texture (Unit 1)
  const maskTexture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, maskTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, maskCanvas);

  // Locate uniforms
  const uImage = gl.getUniformLocation(program, 'u_image');
  const uMask = gl.getUniformLocation(program, 'u_mask');
  const uTime = gl.getUniformLocation(program, 'u_time');
  const uIntensity = gl.getUniformLocation(program, 'u_intensity');
  const uSpeed = gl.getUniformLocation(program, 'u_speed');
  const uShowMask = gl.getUniformLocation(program, 'u_show_mask');

  gl.uniform1i(uImage, 0);
  gl.uniform1i(uMask, 1);

  return {
    render: (time0to1: number, intensity = 1.0, speed = 1.0, showMask = false) => {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform1f(uTime, time0to1);
      gl.uniform1f(uIntensity, intensity);
      gl.uniform1f(uSpeed, speed);
      gl.uniform1i(uShowMask, showMask ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
    updateMask: (newMaskCanvas: HTMLCanvasElement) => {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, maskTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, newMaskCanvas);
    },
    destroy: () => {
      try {
        gl.deleteTexture(imageTexture);
        gl.deleteTexture(maskTexture);
        gl.deleteBuffer(posBuffer);
        gl.deleteProgram(program);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
      } catch {}
    }
  };
}

/**
 * High-definition Video Exporter for Water Ripple Cinemagraphs.
 * Renders smooth 30fps frames using WebGL and compiles to MP4 / WebM with MediaRecorder.
 */
export async function createClientSideWaterVideo(
  img: HTMLImageElement,
  maskCanvas: HTMLCanvasElement,
  options: WaterVideoRenderOptions
): Promise<{ url: string; mime: string }> {
  return new Promise((resolve, reject) => {
    try {
      const width = options.aspect === '16:9' ? 1280 : 720;
      const height = options.aspect === '16:9' ? 720 : 1280;

      // Offscreen WebGL Canvas for water shader displacement
      const glCanvas = document.createElement('canvas');
      glCanvas.width = width;
      glCanvas.height = height;

      // Final 2D composite Canvas for video capture + branding overlays
      const compCanvas = document.createElement('canvas');
      compCanvas.width = width;
      compCanvas.height = height;
      const ctx = compCanvas.getContext('2d')!;

      const renderer = createWaterRippleRenderer(glCanvas, img, maskCanvas);
      if (!renderer) {
        throw new Error('Failed to initialize WebGL water renderer');
      }

      // Check browser codec support
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
      const durationSec = Math.max(2, Math.min(10, options.durationSec || 5));
      const totalFrames = Math.round(durationSec * fps);

      const stream = (compCanvas as any).captureStream
        ? (compCanvas as any).captureStream(fps)
        : (compCanvas as any).mozCaptureStream
        ? (compCanvas as any).mozCaptureStream(fps)
        : null;

      if (!stream || typeof MediaRecorder === 'undefined') {
        renderer.destroy();
        return resolve({ url: img.src, mime: 'image/webp' });
      }

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 });
      } catch {
        recorder = new MediaRecorder(stream);
        mimeType = recorder.mimeType || 'video/webm';
      }

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        renderer.destroy();
        const blob = new Blob(chunks, { type: mimeType });
        const blobUrl = URL.createObjectURL(blob);
        resolve({ url: blobUrl, mime: mimeType });
      };

      recorder.start();

      let frame = 0;
      const renderNextFrame = () => {
        const t = frame / totalFrames; // 0.0 to 1.0 (seamless loop)

        // 1. Render WebGL water ripple frame
        renderer.render(t, options.intensity, options.speed, false);

        // 2. Blit WebGL frame to 2D composite canvas
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(glCanvas, 0, 0, width, height);

        // 3. Cinematic Vignette & Bottom Gradient Overlay
        const grad = ctx.createLinearGradient(0, height * 0.62, 0, height);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.5, 'rgba(0,0,0,0.3)');
        grad.addColorStop(1, 'rgba(0,0,0,0.85)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, height * 0.62, width, height * 0.38);

        const topGrad = ctx.createLinearGradient(0, 0, 0, height * 0.18);
        topGrad.addColorStop(0, 'rgba(0,0,0,0.38)');
        topGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = topGrad;
        ctx.fillRect(0, 0, width, height * 0.18);

        // 4. Branding & Typography Overlay
        if (options.brandingText) {
          ctx.save();
          ctx.fillStyle = '#FFFFFF';
          ctx.font = `bold ${Math.round(width * 0.038)}px system-ui, -apple-system, sans-serif`;
          ctx.textAlign = 'center';
          ctx.shadowColor = 'rgba(0,0,0,0.85)';
          ctx.shadowBlur = 12;

          const textY = height - (options.aspect === '16:9' ? 44 : 90);
          ctx.fillText(options.brandingText, width / 2, textY);

          if (options.showBrandingLogo !== false) {
            ctx.font = `bold ${Math.round(width * 0.02)}px system-ui, -apple-system, sans-serif`;
            ctx.fillStyle = '#C5A880';
            ctx.fillText('ResortOS • סיור וידאו יוקרתי', width / 2, textY + (options.aspect === '16:9' ? 24 : 32));
          }
          ctx.restore();
        }

        frame++;
        if (frame <= totalFrames) {
          requestAnimationFrame(renderNextFrame);
        } else {
          try {
            if (recorder.state === 'recording') recorder.stop();
          } catch {}
        }
      };

      renderNextFrame();
    } catch (err) {
      reject(err);
    }
  });
}
