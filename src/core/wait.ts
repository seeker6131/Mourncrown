// "Please wait..." overlay (index.html #wait) shown while a scene loads and builds its map.
import { lang } from './i18n';
export function showWait() {
  const el = document.getElementById('wait'), t = document.getElementById('waitTxt');
  if (t) t.textContent = lang() === 'en' ? 'Please wait' : 'รอสักครู่';
  el?.classList.add('on');
}
export function hideWait() { document.getElementById('wait')?.classList.remove('on'); }
