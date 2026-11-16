# Elite Tuner X 0.3.0

แอปวัดผลและจูนเกมบน Android — **ไม่ต้องรูท ไม่ต้องลง Shizuku**
รองรับทุกชิป (Snapdragon/Adreno, Dimensity/Mali, Exynos/Xclipse, Tensor, Unisoc) และทุกสกิน (HyperOS, One UI, ColorOS, OxygenOS, Android ทั่วไป) ตั้งแต่ Android 8 ขึ้นไป
CPU: arm64-v8a, armeabi-v7a, x86_64

## เริ่มใช้งาน (ครั้งเดียว)
1. ติดตั้ง APK จากหน้า **Releases**
2. เปิดแอป → แตะแถบเหลือง "ยังไม่ได้เชื่อม ADB ในตัว" → ทำตาม 4 ขั้น
   - เปิด *ตัวเลือกสำหรับนักพัฒนา* → ต่อ Wi-Fi → เปิด *Wireless debugging*
   - กด **เริ่มจับคู่** → ในหน้า Wireless debugging กด *จับคู่อุปกรณ์ด้วยรหัสจับคู่* → ดึงแจ้งเตือนลง → **ใส่รหัส** 6 หลัก
3. เสร็จ — หลังรีบูตแอปจะเปิด Wireless debugging และเชื่อมกลับให้เอง (ขอแค่ต่อ Wi-Fi)

เครื่องที่รูทแล้วใช้ได้ทันทีไม่ต้องจับคู่ • Android 8–10 ใช้ `adb tcpip 5555` จากคอม 1 ครั้ง • ถ้ามี Shizuku อยู่แล้วก็ใช้ร่วมได้

## เมนู
| แท็บ | ใช้ทำอะไร |
|---|---|
| **หน้าหลัก** | ชื่อ GPU จริงจากไดรเวอร์, เกมที่เปิดอยู่ (ความละเอียดเรนเดอร์จริง เช่น 1920×1080, Vulkan/GLES, CPU/RAM ของเกม), FPS/GPU/CPU/อุณหภูมิ/วัตต์ สด, เปิด HUD, อัดเซสชัน |
| **HUD** | ตัวอย่าง HUD สด, เลือกแบบ เต็ม / แถบ / มินิ, ขนาด, ความทึบ, เลือกบรรทัดที่จะโชว์ |
| **จูน** | ล็อกรีเฟรชเรต, Game Mode + ลดความละเอียด/ล็อก FPS ต่อเกม, ล้าง RAM, ปิด phantom process killer, compile, ANGLE, คืนค่าทั้งหมด |
| **แล็บ** | เบนช์มาร์ก GPU (GLES3) และตรวจไดรเวอร์ Vulkan / DXVK / Turnip |
| **เซสชัน** | ผลที่อัดไว้: avg FPS, 1% low, jank, FPS/W — เทียบหลายเซสชัน, ส่งออก CSV |
| **⚙ ตั้งค่า** | การเชื่อมต่อ (ADB ในตัว / Root / Shizuku), ESP32, ข้อมูลเครื่อง, ไลเซนส์ |

ทุกการ์ดในแอปมีปุ่ม **ⓘ ใช้ทำอะไร?** อธิบายภาษาไทย

## HUD ทับเกม
- **แตะ** = เปิดแผงจูนด่วน (ล็อก FPS, ความละเอียดเรนเดอร์, โหมดเกม, รีเฟรชเรต, ล้าง RAM, อัดเซสชัน)
- **กดค้าง** = เปลี่ยนแบบ HUD • **ลาก** = ย้าย

## ค่าที่วัด และแหล่งข้อมูลจริง
| ค่า | แหล่ง |
|---|---|
| FPS / frame time | เวลาที่แต่ละเฟรมขึ้นจอจริงจาก SurfaceFlinger — ขึ้นทันทีเพราะใช้ประวัติ ~128 เฟรมล่าสุด |
| ความละเอียดเกม | ขนาด buffer ของ layer เกม (HWC source crop / activeBuffer) |
| API กราฟิก | GpuStats ของ Android (`dumpsys gpu`) |
| GPU % | Adreno `kgsl`, Exynos/Xclipse `/sys/kernel/gpu`, MediaTek GED, Mali `utilization`, devfreq — ถ้าเฟิร์มแวร์ซ่อน ใช้ Android GPU work periods (Android 13+) |
| ชื่อ GPU | `GL_RENDERER` จากไดรเวอร์ (ไม่ต้องใช้สิทธิ์) |
| CPU % / ของเกม | `/proc/stat`, `/proc/<pid>/stat` |
| RAM ของเกม | `dumpsys meminfo` (PSS) |
| อุณหภูมิ | thermal zones (จัดกลุ่มชื่อของทุกค่าย) + battery |
| วัตต์ | กระแส × แรงดันแบต (ทั้งเครื่อง) |

ถ้าเฟิร์มแวร์บล็อก sensor ตัวไหนจะขึ้น **N/A** — ไม่สุ่มหรือเดาค่า

## ESP32
ดู `esp32/EliteTunerX_ESP32/EliteTunerX_ESP32.ino` — จอแสดงผลแยก + ปุ่มจูน ผ่าน Wi-Fi (UDP JSON)
- มือถือ → ESP32: พอร์ต 4210 ทุก 250 ms • ESP32 → มือถือ: พอร์ต 4211
- ทุกแพ็กเก็ตต้องมี `key` ตรงกับรหัสอุปกรณ์ในแอป (⚙ → ESP32)
- คำสั่ง: `fps`, `scale`, `mode`, `hz`, `ram`, `rec`, `hello`
- ตัวอย่างวาดจอใหม่ทั้งหน้าทุก 250 ms (อาจกะพริบ) — ถ้าบอร์ดมี PSRAM ให้เปลี่ยนไปวาดผ่าน `TFT_eSprite`

## ก่อนขาย (สำคัญ)
- **คีย์เซ็น APK** `app/etx-signing.jks` ถูก commit ไว้แบบสาธารณะ — ก่อนขายต้องสร้างคีย์ใหม่เก็บเป็นความลับ (GitHub Secrets) ไม่งั้นใครก็ปลอมอัปเดตแอปคุณได้
- ตรวจไลเซนส์ไลบรารี: libadb-android (เลือกใช้ Apache-2.0), spake2-android (ดูไลเซนส์ต้นทาง — ผู้พัฒนาแจ้งว่ามีส่วนที่เป็น LGPL), Conscrypt (Apache-2.0), Bouncy Castle (MIT), Shizuku API (Apache-2.0), libadrenotools (BSD-2-Clause)
- Google Play มีนโยบายเรื่องแอปที่ใช้ ADB/สิทธิ์ระบบ — ขายนอก Play (เว็บ/ร้านค้าเอง) ง่ายกว่า

## Build
GitHub Actions (`.github/workflows/elitetunerx.yml`) build release APK ทุกครั้งที่ push และสร้าง GitHub Release
Build เอง: `cd EliteTunerX && ./gradlew assembleRelease` (ต้องมี Android SDK 35 + NDK 27 + CMake 3.22)
