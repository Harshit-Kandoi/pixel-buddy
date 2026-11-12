import { describe, expect, it } from 'vitest';
import { backgroundAdvice, classifyBackground } from '../../utils/backgroundCheck';

function image(width: number, height: number, paint: (x: number, y: number) => [number, number, number, number]): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) pixels.set(paint(x, y), (y * width + x) * 4);
  return pixels;
}
const centre = (x: number, y: number): boolean => x > 10 && x < 30 && y > 10 && y < 30;
const person: [number, number, number, number] = [120, 70, 40, 255];

describe('avatar background check', () => {
  it('finds a real transparent background', () => {
    const px = image(40, 40, (x, y) => (centre(x, y) ? person : [0, 0, 0, 0]));
    expect(classifyBackground(px, 40, 40)).toBe('transparent');
    expect(backgroundAdvice('transparent')).toBeNull();
  });

  it('spots a checkerboard drawn into the picture', () => {
    const px = image(40, 40, (x, y) => (centre(x, y) ? person : (Math.floor(x / 5) + Math.floor(y / 5)) % 2 ? [255, 255, 255, 255] : [204, 204, 204, 255]));
    expect(classifyBackground(px, 40, 40)).toBe('checkerboard');
    expect(backgroundAdvice('checkerboard')).toMatch(/Remove Background/);
  });

  it('calls a solid or photo background opaque', () => {
    expect(classifyBackground(image(40, 40, (x, y) => (centre(x, y) ? person : [255, 255, 255, 255])), 40, 40)).toBe('opaque');
    expect(classifyBackground(image(40, 40, (x) => [x * 6, 90, 200, 255]), 40, 40)).toBe('opaque');
  });
});
