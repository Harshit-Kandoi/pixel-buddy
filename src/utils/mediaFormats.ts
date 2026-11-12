// File types the desktop app accepts as a custom buddy. One list, used by the file picker,
// the import check, and the renderer (to tell images from videos).
// Images show as they are: PNG, GIF, WebP, APNG, AVIF and SVG can be transparent; JPG and BMP
// can't, so they show as a rectangle. Videos are chroma-keyed (green screen) unless they
// carry their own transparency. HEIC isn't here because Chromium can't display it.

export const IMAGE_EXTENSIONS = ['png', 'gif', 'webp', 'apng', 'avif', 'jpg', 'jpeg', 'svg', 'bmp'];
export const VIDEO_EXTENSIONS = ['mp4', 'm4v', 'webm', 'mov'];
export const MEDIA_EXTENSIONS = [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS];

const extensionOf = (filePath: string): string => filePath.split('.').pop()?.toLowerCase() ?? '';

export const isImageFile = (filePath: string): boolean => IMAGE_EXTENSIONS.includes(extensionOf(filePath));
export const isMediaFile = (filePath: string): boolean => MEDIA_EXTENSIONS.includes(extensionOf(filePath));

/** Short badge for the avatar library: GIF, Video, Photo or Image. */
export function mediaTypeLabel(filePath: string): string {
  const ext = extensionOf(filePath);
  if (ext === 'gif' || ext === 'apng') return 'GIF';
  if (VIDEO_EXTENSIONS.includes(ext)) return 'Video';
  if (ext === 'jpg' || ext === 'jpeg' || ext === 'bmp') return 'Photo';
  if (IMAGE_EXTENSIONS.includes(ext)) return 'Image';
  return ext.toUpperCase();
}

/** For help text: "PNG, GIF, WebP, …". */
export const SUPPORTED_FORMATS_TEXT = 'PNG, GIF, WebP, JPG, AVIF, SVG, or a green-screen MP4, MOV or WebM';

/** What to expect from each kind of file, for the "Which format?" guide. */
export const FORMAT_GUIDE = [
  { title: 'Transparent', formats: 'PNG, GIF, WebP, AVIF, SVG', text: 'Only your character shows, no box around it.' },
  { title: 'Keeps its background', formats: 'JPG, BMP', text: "These can't be transparent, so the photo's white (or any) background shows as a box." },
  { title: 'Green screen', formats: 'MP4, MOV, WebM', text: 'Film on a solid green background; the green is removed automatically.' },
];

/** A short note about a file the user picked, or null when it will look as expected. */
export function formatHint(filePath: string): string | null {
  const ext = extensionOf(filePath);
  if (ext === 'jpg' || ext === 'jpeg' || ext === 'bmp') {
    return `${ext.toUpperCase()} photos keep their background, so you'll see it as a box. For a cut-out buddy, use a transparent PNG, GIF or WebP.`;
  }
  if (VIDEO_EXTENSIONS.includes(ext)) {
    return 'The solid background colour (like a green screen) is removed. If edges look off, try another option under Keying / Transparency. Videos use the most battery; a picture or GIF is lighter on long days unplugged.';
  }
  return null;
}
