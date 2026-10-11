import React, { useState, useEffect, useRef } from 'react';
import buddyMascot from '../assets/buddy.svg';
import { toMediaUrl } from '../../../utils/mediaUrl';

interface BuddyProps {
  state: string;
  customVideoPath?: string | null;
  keyingMode?: 'auto' | 'native' | 'none';
  debugKeyer?: boolean;
  onMouseDown?: (e: React.MouseEvent) => void;
  clickAnimClass?: string;
  onFileDrop?: (filePath: string) => void;
}

// ─── WebGL Shader Sources ────────────────────────────────────────────────────

const VERT_SRC = `
  attribute vec2 a_pos;
  attribute vec2 a_uv;
  varying vec2 v_uv;
  void main() {
    gl_Position = vec4(a_pos, 0.0, 1.0);
    v_uv = a_uv;
  }
`;

// GPU chroma-key: samples background color from top-left corner of texture,
// removes pixels within threshold distance, smooth alpha at edge to avoid fringing.
const FRAG_SRC = `
  precision mediump float;
  uniform sampler2D u_tex;
  uniform vec3 u_bg;
  uniform float u_thr;
  uniform float u_debug;
  varying vec2 v_uv;
  void main() {
    vec4 c = texture2D(u_tex, v_uv);
    float d = abs(c.r - u_bg.r) + abs(c.g - u_bg.g) + abs(c.b - u_bg.b);
    if (d < u_thr) {
      if (u_debug > 0.5) {
        gl_FragColor = vec4(1.0, 0.0, 1.0, 0.6);
      } else {
        float a = smoothstep(u_thr * 0.4, u_thr, d);
        gl_FragColor = vec4(c.rgb, a);
      }
    } else {
      gl_FragColor = c;
    }
  }
`;

// ─── WebGL Helpers ───────────────────────────────────────────────────────────

interface GLState {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  texture: WebGLTexture;
  uBg: WebGLUniformLocation;
  uThr: WebGLUniformLocation;
  uDebug: WebGLUniformLocation;
}

function buildShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error('Shader error:', gl.getShaderInfoLog(s));
    return null;
  }
  return s;
}

function initGL(canvas: HTMLCanvasElement): GLState | null {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true });
  if (!gl) return null;

  const vs = buildShader(gl, gl.VERTEX_SHADER, VERT_SRC);
  const fs = buildShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  if (!vs || !fs) return null;

  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(prog));
    return null;
  }
  gl.useProgram(prog);

  // Full-screen quad in clip space
  const buf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    // pos(x,y)  uv(u,v)
    -1, -1,  0, 1,
     1, -1,  1, 1,
    -1,  1,  0, 0,
     1,  1,  1, 0,
  ]), gl.STATIC_DRAW);

  const stride = 4 * Float32Array.BYTES_PER_ELEMENT;
  const posLoc = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, stride, 0);

  const uvLoc = gl.getAttribLocation(prog, 'a_uv');
  gl.enableVertexAttribArray(uvLoc);
  gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);

  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.uniform1i(gl.getUniformLocation(prog, 'u_tex'), 0);

  // Cache uniform locations — fetching per-frame is a performance killer
  const uBg = gl.getUniformLocation(prog, 'u_bg')!;
  const uThr = gl.getUniformLocation(prog, 'u_thr')!;
  const uDebug = gl.getUniformLocation(prog, 'u_debug')!;

  return { gl, program: prog, texture, uBg, uThr, uDebug };
}

// Sample background color from video corners via tiny offscreen canvas
function sampleBg(video: HTMLVideoElement): [number, number, number] {
  try {
    const sc = document.createElement('canvas');
    sc.width = 2; sc.height = 2;
    const ctx = sc.getContext('2d')!;
    ctx.drawImage(video, 0, 0, 2, 2);
    const p = ctx.getImageData(0, 0, 1, 1).data;
    return [p[0] / 255, p[1] / 255, p[2] / 255];
  } catch {
    return [0, 0.7, 0.25]; // default green-screen fallback
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export const Buddy: React.FC<BuddyProps> = ({
  state,
  customVideoPath = null,
  keyingMode = 'auto',
  debugKeyer = false,
  onMouseDown,
  clickAnimClass = '',
  onFileDrop,
}) => {
  const [videoError, setVideoError] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glStateRef = useRef<GLState | null>(null);
  const bgRef = useRef<[number, number, number]>([0, 0.7, 0.25]);
  const bgTickRef = useRef(0);
  const rafRef = useRef<number>(0);

  const mediaSrc = customVideoPath ? toMediaUrl(customVideoPath) : buddyMascot;
  const isImage = !customVideoPath || /\.(gif|png|webp|apng)$/i.test(customVideoPath);

  // Animation class goes on the wrapper div, NOT the media element
  // This prevents GIFs from rotating/distorting on click
  let containerAnim = 'buddy-bounce';
  if (state === 'POPUP') containerAnim = 'buddy-walk-in';
  if (clickAnimClass) containerAnim = clickAnimClass;

  // Re-init when source or keying mode changes
  useEffect(() => {
    bgTickRef.current = 0;
    glStateRef.current = null;
    setVideoError(false); // will be re-created in next effect run
  }, [customVideoPath, keyingMode, debugKeyer]);

  useEffect(() => {
    if (isImage || videoError) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // Attempt WebGL — fall back to 2D canvas if unavailable
    let gls: GLState | null = null;
    if (keyingMode === 'auto') {
      gls = initGL(canvas);
      glStateRef.current = gls;
      if (!gls) console.warn('WebGL not available — falling back to 2D canvas chroma key');
    }

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);

      if (!video || video.readyState < 2) return; // video not decoded yet

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;

      // Scale canvas to video dimensions (capped at 160px)
      const maxDim = 160;
      const scale = Math.min(1, maxDim / Math.max(vw, vh));
      const tw = Math.round(vw * scale);
      const th = Math.round(vh * scale);

      if (canvas.width !== tw || canvas.height !== th) {
        canvas.width = tw;
        canvas.height = th;
        canvas.style.width = `${tw}px`;
        canvas.style.height = `${th}px`;
        bgTickRef.current = 0;
        if (gls) gls.gl.viewport(0, 0, tw, th);
      }

      if (keyingMode === 'auto' && gls) {
        // ── GPU path ────────────────────────────────────────
        const { gl, texture, uBg, uThr, uDebug } = gls;

        // Re-sample background color every ~60 frames (~2s)
        if (bgTickRef.current % 60 === 0) {
          bgRef.current = sampleBg(video);
        }
        bgTickRef.current++;

        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

        const [r, g, b] = bgRef.current;
        gl.uniform3f(uBg, r, g, b);
        gl.uniform1f(uThr, 0.22);
        gl.uniform1f(uDebug, debugKeyer ? 1.0 : 0.0);

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      } else if (keyingMode === 'auto' && !gls) {
        // ── CPU 2D-canvas fallback ───────────────────────────
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, tw, th);
        ctx.drawImage(video, 0, 0, tw, th);
        const img = ctx.getImageData(0, 0, tw, th);
        const d = img.data;
        const bgR = d[0], bgG = d[1], bgB = d[2];
        const thr = 60;
        for (let i = 0; i < d.length; i += 4) {
          const dist = Math.abs(d[i] - bgR) + Math.abs(d[i+1] - bgG) + Math.abs(d[i+2] - bgB);
          if (dist < thr) {
            if (debugKeyer) { d[i]=255; d[i+1]=0; d[i+2]=255; d[i+3]=140; }
            else d[i+3] = Math.round((dist / thr) * 255 * 0.6);
          }
        }
        ctx.putImageData(img, 0, 0);

      } else {
        // ── No keying / native alpha ─────────────────────────
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, tw, th);
        ctx.drawImage(video, 0, 0, tw, th);
      }
    };

    video.play().catch((e) => console.warn('Video play interrupted:', e));
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [isImage, videoError, mediaSrc, keyingMode, debugKeyer]);

  // ─── Fallback SVG avatars ────────────────────────────────────────────────

  const svgShadow = { filter: 'drop-shadow(0 8px 12px rgba(0,0,0,0.35))' };

  const renderFallback = () => {
    switch (state) {
      case 'BREAK':
        return (
          <svg width="100" height="100" viewBox="0 0 100 100" className="buddy-media" style={svgShadow}>
            <rect x="25" y="30" width="50" height="50" rx="15" fill="#10b981" />
            <circle cx="40" cy="50" r="5" fill="#1f2937" />
            <circle cx="60" cy="50" r="5" fill="#1f2937" />
            <path d="M 45 62 Q 50 67 55 62" stroke="#1f2937" strokeWidth="3" fill="none" strokeLinecap="round" />
            <circle cx="32" cy="58" r="4" fill="#fb7185" opacity="0.6" />
            <circle cx="68" cy="58" r="4" fill="#fb7185" opacity="0.6" />
          </svg>
        );
      case 'IDLE':
        return (
          <svg width="100" height="100" viewBox="0 0 100 100" className="buddy-media" style={svgShadow}>
            <rect x="25" y="35" width="50" height="45" rx="15" fill="#64748b" />
            <path d="M 35 52 Q 40 56 45 52" stroke="#1e293b" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M 55 52 Q 60 56 65 52" stroke="#1e293b" strokeWidth="3" fill="none" strokeLinecap="round" />
            <text x="72" y="30" fill="#94a3b8" fontSize="12" fontWeight="bold">Z</text>
            <text x="80" y="20" fill="#cbd5e1" fontSize="16" fontWeight="bold">Z</text>
          </svg>
        );
      case 'POPUP':
        return (
          <svg width="100" height="100" viewBox="0 0 100 100" className="buddy-media" style={svgShadow}>
            <rect x="25" y="30" width="50" height="50" rx="15" fill="#8b5cf6" />
            <circle cx="40" cy="45" r="6" fill="white" />
            <circle cx="40" cy="45" r="3" fill="#1e293b" />
            <circle cx="60" cy="45" r="6" fill="white" />
            <circle cx="60" cy="45" r="3" fill="#1e293b" />
            <path d="M 45 58 Q 50 66 55 58 Z" fill="#ef4444" stroke="#1e293b" strokeWidth="2" />
          </svg>
        );
      default:
        return (
          <svg width="100" height="100" viewBox="0 0 100 100" className="buddy-media" style={svgShadow}>
            <rect x="25" y="30" width="50" height="50" rx="15" fill="#8b5cf6" />
            <circle cx="42" cy="48" r="5" fill="#1e293b" />
            <circle cx="58" cy="48" r="5" fill="#1e293b" />
            <path d="M 47 58 Q 50 61 53 58" stroke="#1e293b" strokeWidth="2" fill="none" strokeLinecap="round" />
            <circle cx="36" cy="54" r="3.5" fill="#f472b6" opacity="0.5" />
            <circle cx="64" cy="54" r="3.5" fill="#f472b6" opacity="0.5" />
          </svg>
        );
    }
  };

  const mediaCss: React.CSSProperties = {
    filter: 'drop-shadow(0 8px 14px rgba(0,0,0,0.32))',
    display: 'block',
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && onFileDrop) {
      const fp = window.api.getPathForFile(file);
      if (fp) onFileDrop(fp);
    }
  };

  return (
    <div
      className={`buddy-container ${containerAnim}`}
      onMouseDown={onMouseDown}
      // Block Chromium's native image drag — it swallows mouseup and leaves input stuck
      onDragStart={(e) => e.preventDefault()}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {!videoError ? (
        isImage ? (
          <img
            src={mediaSrc}
            draggable={false}
            className="buddy-media"
            style={mediaCss}
            alt="Buddy Companion"
            onError={() => { console.warn('Image load failed, falling back.'); setVideoError(true); }}
          />
        ) : (
          <>
            <video
              ref={videoRef}
              src={mediaSrc}
              style={{ display: 'none' }}
              loop
              muted
              playsInline
              crossOrigin="anonymous"
              onError={() => { console.warn('Video load failed, falling back.'); setVideoError(true); }}
            />
            <canvas ref={canvasRef} className="buddy-media" style={mediaCss} />
          </>
        )
      ) : (
        renderFallback()
      )}
    </div>
  );
};
