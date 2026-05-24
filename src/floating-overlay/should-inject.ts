type ShouldInjectInput = {
  url: string;
  contentType?: string | null;
  isTopFrame: boolean;
};

export function shouldInjectFloatingOverlay({ url, contentType, isTopFrame }: ShouldInjectInput): boolean {
  if (!isTopFrame) return false;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  if (contentType) {
    const normalized = contentType.toLowerCase();
    if (!normalized.includes('text/html') && !normalized.includes('application/xhtml+xml')) {
      return false;
    }
  }

  return true;
}
