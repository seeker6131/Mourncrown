// "What's new" (director): after an update, a popup lists what changed — once per entry, on this device.
// Brand-new players (under 5 minutes played) skip it. Add a new entry at the TOP with the next id for each release
// the players should hear about (the AI writing an update adds it here).
import { tr } from './i18n';

export const NEWS: { id: number; date: string; items: string[] }[] = [
  { id: 4, date: '14 พ.ย.', items: [
    '⏳ บัพยา/อาหารชนิดเดียวกัน กินซ้ำ = บวกเวลา! สะสมได้ถึง 1 ชม. • 👑 VIP สะสมได้ถึง 3 ชม.',
    '🧪 ตัวบอกบัพ + เวลาที่เหลือ (ใต้แผนที่เล็ก) ใหญ่ขึ้น อ่านง่ายขึ้น',
    '📜 ตลาด: แท็บ "ขายแล้ว" ดูประวัติการขายทั้งเซิร์ฟ + เห็นราคาขายจริงตอนลงขาย',
    '🟢 แก้ตัวเลขผู้เล่นออนไลน์ให้ตรงตามจริง',
  ] },
  { id: 3, date: '13 พ.ย. (ค่ำ)', items: [
    '🏠 แก้บั๊กบ้านหายหลังอัปเดต — ใครโดนบั๊กนี้ (Lv6+ ค้างเควสสร้างบ้าน) ได้บ้าน Lv1 คืนแล้ว ดูจดหมายในกล่อง',
    '⛶ ปุ่มเต็มจอบนแถบด้านบน — เกมไม่บังคับเต็มจอเองแล้ว',
    '🧪 แสดงบัพที่ใช้อยู่ + เวลาที่เหลือ ใต้แผนที่เล็ก — กดบัพใหม่ทับของเดิม เกมจะถามก่อน',
    '⚔ เปิด AUTO แล้วเปิดกระเป๋า/ร้านค้า/หน้าต่างอื่นได้ ฮีโร่ตีมอนต่อ ไม่หยุดแล้ว',
    '⚙ ย่อยอัตโนมัติ / เลือกเก็บของตามระดับ (VIP) — ติ๊กได้ระดับละไม่เกิน 3 • กระเป๋า → 👑 ตั้งค่าเก็บของ',
    '✨ ผู้เล่นคนอื่นเดินเนียนขึ้นอีก (ไม่หยุด-กระตุกเวลาเน็ตแกว่ง)',
    '📜 ประวัติการขายในตลาด (ทุกคนเห็น) + ราคาขายจริงตอนตั้งราคา',
  ] },
  { id: 1, date: '13 พ.ย.', items: [
    '📬 กล่องจดหมาย! กดซองจดหมายบนแถบด้านบน — รับของขวัญและรางวัลจากทีมงาน',
    '🎁 ของขวัญผู้ทดสอบ CBT (VIP 7 วัน + ฉายา「ผู้บุกเบิก」+ ของใช้) รออยู่ในกล่องจดหมาย',
    '🆔 รหัสผู้เล่นในหน้าโปรไฟล์ — กดคัดลอกส่งให้แอดมินเวลาแจ้งปัญหา',
    '🐞 แก้แล้ว: ตีมอนบางทีไม่ได้ EXP ("เซิร์ฟไม่รับ")',
    '🐞 แก้แล้ว: ตัดไม้ / ขุดหินในป่าดงดิบบางทีเก็บไม่ได้',
    '🐞 แก้แล้ว: อาคารในหมู่บ้าน (คอกสัตว์ ฯลฯ) หายหลังรีเกม',
    '🐞 แก้แล้ว: สร้างบ้านแล้วบ้านหายหลังอัปเดต — ถ้าเซิร์ฟไม่รับ เกมจะแจ้งทันที (ไม่แสดงบ้านปลอม)',
    '✨ ผู้เล่นคนอื่นเดินสมูทขึ้น ไม่วาร์ปแล้ว',
    '🤖 เอาบอทออกจากเกมหมดแล้ว — ทุกคนที่เห็นคือผู้เล่นจริง',
  ] },
];
const KEY = 'mcNews';

/** show the newest entries this device has not seen (call once the game is on screen) */
export function showNews(playTimeSec: number) {
  if (typeof document === 'undefined' || !NEWS.length || document.getElementById('mc-news')) return;
  let seen = 0; try { seen = Number(localStorage.getItem(KEY)) || 0; } catch { return; }
  const latest = NEWS[0].id, fresh = !localStorage.getItem(KEY) && playTimeSec < 300;
  try { localStorage.setItem(KEY, String(latest)); } catch { /* private mode */ }
  if (fresh || seen >= latest) return;   // (a new player: nothing to catch up on)
  const list = NEWS.filter(n => n.id > seen).slice(0, 3);
  const box = document.createElement('div'); box.id = 'mc-news';
  box.style.cssText = 'position:fixed;inset:0;z-index:35;display:grid;place-items:center;background:rgba(6,4,10,.6);font-family:system-ui,sans-serif';
  box.innerHTML = `<div style="width:min(440px,92vw);max-height:80vh;overflow:auto;padding:16px 18px;background:#1c1520;border:2px solid #d9b45a;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.6);color:#f3e6c4">
    <b style="display:block;font-size:18px;color:#ffe7a0;text-align:center;margin-bottom:8px">${tr('📢 มีอะไรใหม่')}</b>
    ${list.map(n => `<div style="color:#c8b898;font-size:12px;margin:8px 0 4px">${n.date}</div>${n.items.map(i => `<div style="font-size:14px;line-height:1.5;margin:3px 0">${tr(i)}</div>`).join('')}`).join('')}
    <button style="display:block;margin:14px auto 0;font-size:15px;padding:8px 28px;border:0;border-radius:8px;background:#2f6a3a;color:#fff;font-weight:700">${tr('ตกลง')}</button></div>`;
  document.body.append(box);
  (box.querySelector('button') as HTMLButtonElement).onclick = () => box.remove();
}
