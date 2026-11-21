// Full screen on every platform:
//  • Android / desktop: Fullscreen API (+ lock to landscape where allowed)
//  • iPad Safari: webkit-prefixed Fullscreen API
//  • iPhone Safari: no Fullscreen API at all -> "Add to Home Screen" runs the game as a full-screen web app (manifest + apple meta)
type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };
export const isStandalone = () => window.matchMedia?.('(display-mode: fullscreen)').matches || window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
export const isFullscreen = () => !!(document.fullscreenElement || (document as FsDoc).webkitFullscreenElement) || isStandalone();
export function toggleFullscreen(): 'on' | 'off' | 'ios' | 'none' {
  const d = document as FsDoc, el = document.documentElement as FsEl;
  if (document.fullscreenElement || d.webkitFullscreenElement) { (document.exitFullscreen?.() ?? d.webkitExitFullscreen?.()); return 'off'; }
  if (isStandalone()) return 'on';
  try {
    if (el.requestFullscreen) { el.requestFullscreen({ navigationUI: 'hide' }).then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })?.lock?.('landscape').catch(() => undefined)).catch(() => undefined); return 'on'; }
    if (el.webkitRequestFullscreen) { el.webkitRequestFullscreen(); return 'on'; }
  } catch { /* not allowed */ }
  return /iPhone|iPod/.test(navigator.userAgent) ? 'ios' : 'none';
}
