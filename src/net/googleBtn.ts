// The "Sign in with Google" button (Google Identity Services), drawn by Google in a small box over the title screen.
// The credential goes to our server (net/cloud.ts googleLogin), which checks it with Google.
import { GOOGLE_CLIENT_ID, googleLogin } from './cloud';
import { lang } from '../core/i18n';

type GIS = { accounts: { id: { initialize(o: object): void; renderButton(el: HTMLElement, o: object): void } } };
let loading: Promise<GIS | null> | null = null;
function gis(): Promise<GIS | null> {
  const w = window as unknown as { google?: GIS }; if (w.google?.accounts) return Promise.resolve(w.google);
  return loading ??= new Promise(res => {
    const sc = document.createElement('script'); sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true;
    sc.onload = () => res(w.google ?? null); sc.onerror = () => { loading = null; res(null); }; document.head.append(sc);
  });
}
/** show the button: at a point on the page (its centre, in CSS px), inside a box of a dialog, or bottom-left;
 *  returns a function that removes it */
export function showGoogleButton(done: (r: 'linked' | 'switched' | 'fail') => void, place?: { x: number; y: number; big?: boolean } | HTMLElement): () => void {
  const box = document.createElement('div');
  if (place instanceof HTMLElement) { box.style.cssText = 'display:flex;justify-content:center;min-height:44px'; place.append(box); }
  else { box.style.cssText = place ? `position:fixed;left:${place.x}px;top:${place.y}px;transform:translate(-50%,-50%);z-index:20;` : 'position:fixed;left:10px;bottom:10px;z-index:20;'; document.body.append(box); }
  let gone = false;
  gis().then(g => {
    if (!g || gone) return;
    g.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, ux_mode: 'popup', auto_select: false, callback: (r: { credential: string }) => googleLogin(r.credential).then(done) });
    g.accounts.id.renderButton(box, { theme: 'filled_black', size: place instanceof HTMLElement || (place && place.big) ? 'large' : 'medium', text: 'signin_with', shape: 'pill', locale: lang() === 'th' ? 'th' : 'en' });
  });
  return () => { gone = true; box.remove(); };
}
