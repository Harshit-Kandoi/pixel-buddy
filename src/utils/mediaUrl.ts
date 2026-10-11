// Local files are served to the renderer through the privileged `buddy-media` scheme.
// The scheme is registered as "standard", so the absolute path must be URL-encoded into
// the path segment — otherwise a Windows drive letter like `C:` is parsed as the host.
export function toMediaUrl(filePath: string): string {
  return `buddy-media://local/${encodeURIComponent(filePath)}`;
}
