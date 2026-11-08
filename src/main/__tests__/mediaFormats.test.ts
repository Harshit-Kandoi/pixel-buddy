import { describe, expect, it } from 'vitest';
import { isImageFile, isMediaFile, mediaTypeLabel } from '../../utils/mediaFormats';

describe('custom buddy formats', () => {
  it('accepts common photos, images, GIFs and videos', () => {
    for (const file of ['me.jpg', 'ME.JPEG', 'pet.png', 'dance.gif', 'a.webp', 'b.avif', 'logo.svg', 'old.bmp', 'clip.mp4', 'clip.MOV', 'clip.m4v', 'clip.webm']) {
      expect(isMediaFile(file), file).toBe(true);
    }
  });

  it('rejects what Chromium cannot show or that is not media', () => {
    for (const file of ['iphone.heic', 'notes.pdf', 'sheet.xlsx', 'song.mp3', 'noext']) expect(isMediaFile(file), file).toBe(false);
  });

  it('shows photos and images as images, videos through the keyer', () => {
    expect(isImageFile('C:\\Users\\me\\Downloads\\WhatsApp Image.jpeg')).toBe(true);
    expect(isImageFile('/Users/me/clip.mov')).toBe(false);
  });

  it('labels library items', () => {
    expect(mediaTypeLabel('a.jpg')).toBe('Photo');
    expect(mediaTypeLabel('a.gif')).toBe('GIF');
    expect(mediaTypeLabel('a.mov')).toBe('Video');
    expect(mediaTypeLabel('a.svg')).toBe('Image');
  });
});
