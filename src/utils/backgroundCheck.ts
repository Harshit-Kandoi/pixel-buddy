// Tells whether a custom avatar picture is really see-through. Many "transparent PNGs" from the
// web have the grey-and-white checkerboard drawn into the image, so they show as a box.

export type BackgroundKind = 'transparent' | 'checkerboard' | 'opaque';

const light = (r: number, g: number, b: number): boolean =>
  Math.min(r, g, b) > 170 && Math.max(r, g, b) - Math.min(r, g, b) < 18;

/** Classifies an image from its RGBA pixels (row by row, 4 bytes each) by looking at its edges. */
export function classifyBackground(pixels: Uint8ClampedArray, width: number, height: number): BackgroundKind {
  const at = (x: number, y: number): [number, number, number, number] => {
    const i = (y * width + x) * 4;
    return [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
  };
  const edge: [number, number][] = [];
  for (let x = 0; x < width; x++) edge.push([x, 0], [x, height - 1]);
  for (let y = 0; y < height; y++) edge.push([0, y], [width - 1, y]);
  if (edge.some(([x, y]) => at(x, y)[3] < 250)) return 'transparent';

  // A drawn checkerboard: along the top row, two light neutral greys alternate many times.
  const row = Array.from({ length: width }, (_, x) => at(x, 0));
  if (row.every(([r, g, b]) => light(r, g, b))) {
    const levels = row.map(([r, g, b]) => (r + g + b) / 3);
    const lo = Math.min(...levels);
    const hi = Math.max(...levels);
    if (hi - lo > 12) {
      const mid = (hi + lo) / 2;
      let switches = 0;
      for (let x = 1; x < width; x++) if (levels[x] > mid !== levels[x - 1] > mid) switches++;
      if (switches >= 4) return 'checkerboard';
    }
  }
  return 'opaque';
}

/** Advice for a picture whose background won't be see-through, or null when it's fine. */
export function backgroundAdvice(kind: BackgroundKind): string | null {
  if (kind === 'checkerboard') {
    return "This picture has a checkerboard drawn into it, so it isn't really see-through. Remove the background first, then add the new file: on a Mac, right-click it in Finder → Quick Actions → Remove Background; on Windows 11, open it in Paint → Remove background. For an animated GIF, use a GIF editor's transparency tool or a green-screen video instead.";
  }
  if (kind === 'opaque') {
    return 'This picture has its own background, so it shows as a box. For a cut-out buddy, remove the background first: on a Mac, right-click it in Finder → Quick Actions → Remove Background; on Windows 11, Paint → Remove background.';
  }
  return null;
}
