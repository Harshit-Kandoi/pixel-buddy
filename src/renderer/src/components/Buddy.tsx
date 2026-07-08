import React, { useState, useEffect, useRef } from 'react';
import buddyVideo from '../assets/buddy.mp4';

interface BuddyProps {
  state: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  customVideoPath?: string | null;
  keyingMode?: 'auto' | 'native' | 'none';
  debugKeyer?: boolean;
  onMouseDown?: (e: React.MouseEvent) => void;
  clickAnimClass?: string;
  onFileDrop?: (filePath: string) => void;
}

export const Buddy: React.FC<BuddyProps> = ({
  state,
  onMouseEnter,
  onMouseLeave,
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
  const frameCacheRef = useRef<Map<number, ImageData>>(new Map());

  // Determine media source
  const mediaSrc = customVideoPath ? `buddy-media://${customVideoPath}` : buddyVideo;
  const isImage = customVideoPath ? /\.(gif|png|webp|apng)$/i.test(customVideoPath) : false;

  // Determine animation classes
  let animClass = 'buddy-bounce';
  if (state === 'POPUP') {
    animClass = 'buddy-walk-in';
  }
  if (clickAnimClass) {
    animClass = clickAnimClass;
  }

  // Clear frame cache when source file, keying mode, or debug status changes
  useEffect(() => {
    frameCacheRef.current.clear();
  }, [customVideoPath, keyingMode, debugKeyer]);

  useEffect(() => {
    // If it's a static image or GIF, we don't need the frame processing loop
    if (isImage || videoError) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    // Helper to extract unique background colors from corners and border midpoints
    const sampleBackgroundColors = (rawBuf: Uint8ClampedArray, w: number, h: number): [number, number, number][] => {
      const samples: [number, number, number][] = [];
      const coords = [
        [0, 0],
        [w - 1, 0],
        [0, h - 1],
        [w - 1, h - 1],
        [Math.floor(w / 2), 0],
        [Math.floor(w / 2), h - 1],
        [0, Math.floor(h / 2)],
        [w - 1, Math.floor(h / 2)]
      ];

      for (const [cx, cy] of coords) {
        const idx = (cy * w + cx) * 4;
        const cr = rawBuf[idx];
        const cg = rawBuf[idx + 1];
        const cb = rawBuf[idx + 2];

        // Deduplicate very similar colors
        const isDup = samples.some(([sr, sg, sb]) =>
          Math.abs(cr - sr) + Math.abs(cg - sg) + Math.abs(cb - sb) < 15
        );

        if (!isDup) {
          samples.push([cr, cg, cb]);
        }
      }

      return samples;
    };

    const processFrame = () => {
      if (video.paused || video.ended) {
        animationFrameId = requestAnimationFrame(processFrame);
        return;
      }

      // Match canvas dimensions to the loaded video with downscaling limit (max 150px)
      if (video.videoWidth > 0) {
        const maxDim = 150;
        let targetW = video.videoWidth;
        let targetH = video.videoHeight;
        if (targetW > maxDim || targetH > maxDim) {
          const ratio = Math.min(maxDim / targetW, maxDim / targetH);
          targetW = Math.round(targetW * ratio);
          targetH = Math.round(targetH * ratio);
        }

        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
          frameCacheRef.current.clear(); // clear cache on resize
        }
      }

      const w = canvas.width;
      const h = canvas.height;

      if (w === 0 || h === 0) {
        animationFrameId = requestAnimationFrame(processFrame);
        return;
      }

      // Unique frame index (estimating 30fps)
      const frameIndex = Math.round(video.currentTime * 30);

      // Hit cache if possible to bypass heavy pixel operations
      if (keyingMode !== 'none' && frameCacheRef.current.has(frameIndex)) {
        const cachedData = frameCacheRef.current.get(frameIndex)!;
        ctx.putImageData(cachedData, 0, 0);
      } else {
        // Draw raw frame to canvas
        ctx.drawImage(video, 0, 0, w, h);

        if (keyingMode === 'auto') {
          const imgData = ctx.getImageData(0, 0, w, h);
          const data = imgData.data;
          const visited = new Uint8Array(w * h);
          const queue = new Int32Array(w * h);
          let head = 0;
          let tail = 0;

          // Self-calibrate background colors from borders of raw buffer
          const bgColors = sampleBackgroundColors(data, w, h);

          // Coordinate enqueue function
          const enqueue = (x: number, y: number) => {
            if (x >= 0 && x < w && y >= 0 && y < h) {
              const idx = y * w + x;
              if (!visited[idx]) {
                visited[idx] = 1;
                queue[tail++] = idx;
              }
            }
          };

          // Seed all border pixels
          for (let x = 0; x < w; x++) {
            enqueue(x, 0);
            enqueue(x, h - 1);
          }
          for (let y = 0; y < h; y++) {
            enqueue(0, y);
            enqueue(w - 1, y);
          }

          // BFS traversal to key dynamic background colors
          while (head < tail) {
            const idx = queue[head++];
            const x = idx % w;
            const y = Math.floor(idx / w);
            const rIdx = idx * 4;

            const r = data[rIdx];
            const g = data[rIdx + 1];
            const b = data[rIdx + 2];

            // Match if pixel is close to any sampled background color (L1 distance < 50)
            const isBg = bgColors.some(([br, bg, bb]) =>
              Math.abs(r - br) + Math.abs(g - bg) + Math.abs(b - bb) < 50
            );

            if (isBg) {
              if (debugKeyer) {
                // Visualize pixels: highlight keyed backgrounds in magenta
                data[rIdx] = 255;
                data[rIdx + 1] = 0;
                data[rIdx + 2] = 255;
                data[rIdx + 3] = 140;
              } else {
                data[rIdx + 3] = 0; // key out background pixel
              }

              enqueue(x + 1, y);
              enqueue(x - 1, y);
              enqueue(x, y + 1);
              enqueue(x, y - 1);
            }
          }

          ctx.putImageData(imgData, 0, 0);

          // Store a copy in the frame cache
          const cacheCopy = new ImageData(new Uint8ClampedArray(imgData.data), w, h);
          frameCacheRef.current.set(frameIndex, cacheCopy);
        } else if (keyingMode === 'native') {
          // Native transparency - just extract frame to save CPU
          const imgData = ctx.getImageData(0, 0, w, h);
          const cacheCopy = new ImageData(new Uint8ClampedArray(imgData.data), w, h);
          frameCacheRef.current.set(frameIndex, cacheCopy);
        }
      }

      animationFrameId = requestAnimationFrame(processFrame);
    };

    // Attempt video playback
    video.play().catch((err) => console.warn("Video play interrupted:", err));
    processFrame();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isImage, videoError, mediaSrc, keyingMode, debugKeyer]);

  const renderFallbackSVG = () => {
    const svgStyle = { filter: `drop-shadow(0 10px 15px rgba(0,0,0,0.3))` };
    switch (state) {
      case 'BREAK':
        return (
          <svg width="100" height="100" viewBox="0 0 100 100" className="buddy-media" style={svgStyle}>
            <rect x="25" y="30" width="50" height="50" rx="15" fill="#10b981" />
            <rect x="20" y="45" width="60" height="25" rx="8" fill="#047857" />
            <circle cx="40" cy="50" r="5" fill="#1f2937" />
            <circle cx="60" cy="50" r="5" fill="#1f2937" />
            <polygon points="30,45 70,45 68,54 55,54 52,48 48,48 45,54 32,54" fill="#1e293b" />
            <line x1="30" y1="47" x2="70" y2="47" stroke="#94a3b8" strokeWidth="2" />
            <path d="M 45 62 Q 50 67 55 62" stroke="#1f2937" strokeWidth="3" fill="none" strokeLinecap="round" />
            <circle cx="32" cy="58" r="4" fill="#fb7185" opacity="0.6" />
            <circle cx="68" cy="58" r="4" fill="#fb7185" opacity="0.6" />
          </svg>
        );

      case 'IDLE':
        return (
          <svg width="100" height="100" viewBox="0 0 100 100" className="buddy-media" style={svgStyle}>
            <rect x="25" y="35" width="50" height="45" rx="15" fill="#64748b" />
            <path d="M 35 52 Q 40 56 45 52" stroke="#1e293b" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M 55 52 Q 60 56 65 52" stroke="#1e293b" strokeWidth="3" fill="none" strokeLinecap="round" />
            <circle cx="50" cy="62" r="3" fill="#1e293b" />
            <text x="72" y="30" fill="#94a3b8" fontSize="12" fontWeight="bold" className="buddy-bounce">Z</text>
            <text x="80" y="20" fill="#cbd5e1" fontSize="16" fontWeight="bold" style={{ animationDelay: '0.5s' }} className="buddy-bounce">Z</text>
          </svg>
        );

      case 'POPUP':
        return (
          <svg width="100" height="100" viewBox="0 0 100 100" className="buddy-media" style={svgStyle}>
            <rect x="25" y="30" width="50" height="50" rx="15" fill="#8b5cf6" />
            <rect x="30" y="20" width="10" height="15" rx="5" fill="#a78bfa" />
            <rect x="60" y="20" width="10" height="15" rx="5" fill="#a78bfa" />
            <circle cx="40" cy="45" r="6" fill="white" />
            <circle cx="40" cy="45" r="3" fill="#1e293b" />
            <circle cx="60" cy="45" r="6" fill="white" />
            <circle cx="60" cy="45" r="3" fill="#1e293b" />
            <path d="M 25 55 Q 12 40 10 30" stroke="#8b5cf6" strokeWidth="10" strokeLinecap="round" fill="none" />
            <path d="M 45 58 Q 50 66 55 58 Z" fill="#ef4444" stroke="#1e293b" strokeWidth="2" />
            <circle cx="34" cy="54" r="4" fill="#ec4899" opacity="0.6" />
            <circle cx="66" cy="54" r="4" fill="#ec4899" opacity="0.6" />
          </svg>
        );

      default:
        return (
          <svg width="100" height="100" viewBox="0 0 100 100" className="buddy-media" style={svgStyle}>
            <rect x="25" y="30" width="50" height="50" rx="15" fill="#8b5cf6" />
            <path d="M 50 30 C 50 20, 60 15, 62 15 C 62 15, 55 25, 50 30" fill="#a78bfa" />
            <circle cx="42" cy="48" r="5" fill="#1e293b" />
            <circle cx="58" cy="48" r="5" fill="#1e293b" />
            <path d="M 47 58 Q 50 61 53 58" stroke="#1e293b" strokeWidth="2" fill="none" strokeLinecap="round" />
            <circle cx="36" cy="54" r="3.5" fill="#f472b6" opacity="0.5" />
            <circle cx="64" cy="54" r="3.5" fill="#f472b6" opacity="0.5" />
          </svg>
        );
    }
  };

  const buddyMediaStyle = {
    filter: `drop-shadow(0 10px 15px rgba(0, 0, 0, 0.3))`
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && onFileDrop) {
      const filePath = (file as any).path;
      if (filePath) {
        onFileDrop(filePath);
      }
    }
  };

  return (
    <div 
      className={`buddy-container ${animClass}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseDown={onMouseDown}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {!videoError ? (
        isImage ? (
          <img
            src={mediaSrc}
            className="buddy-media"
            style={buddyMediaStyle}
            alt="Buddy Companion"
            onError={() => {
              console.warn('Transparent buddy image failed to load, falling back to SVG.');
              setVideoError(true);
            }}
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
              onError={() => {
                console.warn('Transparent buddy video failed to load, falling back to SVG.');
                setVideoError(true);
              }}
            />
            <canvas
              ref={canvasRef}
              className="buddy-media"
              style={buddyMediaStyle}
            />
          </>
        )
      ) : (
        renderFallbackSVG()
      )}
    </div>
  );
};
