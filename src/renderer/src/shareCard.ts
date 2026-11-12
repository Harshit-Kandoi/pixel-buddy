import type { AppSettings } from '../../utils/types';
import { festivalFor, type AvatarSkin } from '../../utils/seasons';
import { avatarSrc } from './avatars';

// A 1200×630 image of today's stats with the buddy, sized for LinkedIn, X and WhatsApp
// previews. Drawn locally on a canvas; nothing is uploaded anywhere.

const W = 1200;
const H = 630;
const INK = '#213e31';
const MUTED = '#657468';
const FONT = '"Segoe UI", system-ui, -apple-system, Arial, sans-serif';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, size: number, weight = 800): void {
  let s = size;
  do ctx.font = `${weight} ${s--}px ${FONT}`;
  while (ctx.measureText(text).width > maxWidth && s > 16);
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

export async function drawShareCard(settings: AppSettings, skin: AvatarSkin, now = new Date()): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const festival = skin === 'classic' ? null : festivalFor(skin);
  const theme = festival?.card ?? { paper: '#f5f4eb', dots: '#a3b88c44', line: '#d7ddd0', accent: '#608250' };

  // Paper background with the website's dot grid
  ctx.fillStyle = theme.paper;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = theme.dots;
  for (let x = 14; x < W; x += 22) for (let y = 14; y < H; y += 22) ctx.fillRect(x, y, 2, 2);

  // Heading
  const date = now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  ctx.fillStyle = MUTED;
  ctx.font = `700 18px ${FONT}`;
  ctx.letterSpacing = '3px';
  ctx.fillText(`${festival ? `${festival.name.toUpperCase()} ${festival.emoji}` : 'MY KINDER WORKDAY'}  ·  ${date.toUpperCase()}`, 72, 104);
  ctx.letterSpacing = '0px';

  const name = settings.userName?.trim();
  const headline = name ? `${name}'s little wins today` : 'My little wins today';
  ctx.fillStyle = INK;
  fitText(ctx, headline, 640, 56);
  ctx.fillText(headline, 72, 178);

  // Stat tiles
  const focus = settings.statsFocusMinutesToday ?? 0;
  const tiles = [
    { value: focus >= 60 ? `${Math.floor(focus / 60)}h ${focus % 60}m` : `${focus}m`, label: 'focused' },
    { value: String(settings.statsBreaksCompletedToday ?? 0), label: 'breaks taken' },
    { value: `${settings.hydrationDrankToday ?? 0}/${settings.hydrationGoal ?? 8}`, label: 'glasses of water' },
  ];
  tiles.forEach((tile, i) => {
    const x = 72 + i * 216;
    roundRect(ctx, x, 230, 196, 156, 18);
    ctx.fillStyle = '#fffdf6';
    ctx.fill();
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = i === 2 ? '#2f6fb0' : festival && i === 1 ? theme.accent : '#28593e';
    fitText(ctx, tile.value, 160, 52);
    ctx.fillText(tile.value, x + 22, 314);
    ctx.fillStyle = MUTED;
    ctx.font = `600 18px ${FONT}`;
    ctx.fillText(tile.label, x + 22, 354);
  });

  ctx.fillStyle = theme.accent;
  ctx.font = `italic 30px Georgia, serif`;
  ctx.fillText('Little breaks. Big difference.', 72, 460);

  // Buddy with a speech bubble
  ctx.fillStyle = '#1b423118';
  ctx.beginPath();
  ctx.ellipse(960, 540, 150, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  const buddy = await loadImage(avatarSrc(skin));
  ctx.drawImage(buddy, 790, 200, 340, 354);

  roundRect(ctx, 800, 92, 300, 74, 16);
  ctx.fillStyle = '#fffdf1';
  ctx.fill();
  ctx.strokeStyle = '#d3dbc4';
  ctx.stroke();
  ctx.fillStyle = INK;
  fitText(ctx, festival?.wish ?? 'Proud of you! ✨', 252, 22, 600);
  ctx.fillText(festival?.wish ?? 'Proud of you! ✨', 826, 138);

  // Footer
  ctx.fillStyle = '#e6ebda';
  ctx.fillRect(0, H - 72, W, 72);
  ctx.fillStyle = INK;
  ctx.font = `800 22px ${FONT}`;
  ctx.fillText('pixel buddy', 72, H - 28);
  ctx.fillStyle = MUTED;
  ctx.font = `500 18px ${FONT}`;
  ctx.fillText('A free break & water reminder for Chrome and desktop', 214, H - 29);
  ctx.textAlign = 'right';
  ctx.fillText('pixelbuddy.harshitkandoi.in', W - 72, H - 29);
  ctx.textAlign = 'left';

  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not draw the card'))), 'image/png'));
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
