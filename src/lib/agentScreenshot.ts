export function agentScreenshotUrl(
  screenshot?: string | null,
  cloudinary?: string | null
): string | null {
  if (cloudinary) return cloudinary;
  if (!screenshot) return null;
  if (/^https?:\/\//i.test(screenshot)) return screenshot;

  const safePath = screenshot
    .split(/[\\/]+/)
    .filter((part) => part && part !== "." && part !== "..")
    .map(encodeURIComponent)
    .join("/");

  return safePath ? `/api/agent/screenshot/${safePath}` : null;
}
