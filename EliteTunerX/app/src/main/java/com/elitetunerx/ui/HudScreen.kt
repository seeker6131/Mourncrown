package com.elitetunerx.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.elitetunerx.Prefs
import com.elitetunerx.core.Telemetry
import com.elitetunerx.hud.HudService
import com.elitetunerx.hud.HudView
import java.util.Locale

@Composable
fun HudScreen() {
    val ctx = LocalContext.current
    val p = remember { Prefs.get(ctx) }
    val snap by Telemetry.snapshot.collectAsState()
    val running by HudService.running.collectAsState()
    var cfg by remember { mutableStateOf(HudService.loadConfig(ctx)) }
    val startHud = rememberHudStarter()

    fun save(block: android.content.SharedPreferences.Editor.() -> Unit) {
        p.edit().apply(block).apply()
        cfg = HudService.loadConfig(ctx)
        HudService.reload(ctx)
    }

    ScreenColumn {
        Header("HUD", "หน้าต่างลอยทับเกม — ปรับหน้าตาได้ตามใจ")

        PanelCard(
            "ตัวอย่างสด",
            help = "นี่คือ HUD ตัวจริงที่จะลอยบนเกม (ข้อมูลสดจากเครื่อง) ปรับด้านล่างแล้วเห็นผลทันที\nตอนเล่นเกม:\n• แตะ HUD = เปิดแผงจูนด่วน\n• กดค้าง = เปลี่ยนแบบ\n• ลาก = ย้ายตำแหน่ง (จำตำแหน่งไว้ให้)"
        ) {
            Box(Modifier.fillMaxWidth().padding(vertical = 6.dp), contentAlignment = Alignment.Center) {
                AndroidView(factory = { HudView(it) }, update = { v ->
                    v.cfg = cfg
                    v.update(snap, null)
                })
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (!running) PrimaryButton("เปิด HUD บนเกม", onClick = startHud) else SecondaryButton("ปิด HUD") { HudService.stop(ctx) }
            }
        }

        PanelCard(
            "แบบ HUD",
            help = "• เต็ม: ครบทุกอย่าง — FPS ตัวใหญ่, กราฟ frame time, ความละเอียดเกม, GPU/CPU พร้อมแถบโหลด, RAM, วัตต์\n• แถบ: บรรทัดเดียวบางๆ ไม่บังเกม\n• มินิ: แค่ตัวเลข FPS"
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                HudView.STYLE_NAMES.forEachIndexed { i, name ->
                    FilterChip(cfg.style == i, { save { putInt("hud_style", i) } }, label = { Text(name) },
                        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = Cyan, selectedLabelColor = Bg))
                }
            }
        }

        PanelCard("ขนาดและความทึบ", help = "ขนาด = ย่อ/ขยายทั้ง HUD • ความทึบพื้นหลัง = ยิ่งน้อยยิ่งเห็นเกมทะลุ (ตัวหนังสือยังชัดเท่าเดิม)") {
            Body(String.format(Locale.US, "ขนาด %.0f%%", cfg.scale * 100), Color.White)
            Slider(cfg.scale, { v -> save { putFloat("hud_scale", (v * 20).toInt() / 20f) } }, valueRange = 0.7f..1.6f,
                colors = SliderDefaults.colors(thumbColor = Cyan, activeTrackColor = Cyan))
            Body("ความทึบพื้นหลัง ${cfg.alpha * 100 / 255}%", Color.White)
            Slider(cfg.alpha.toFloat(), { v -> save { putInt("hud_alpha", v.toInt()) } }, valueRange = 0f..255f,
                colors = SliderDefaults.colors(thumbColor = Purple, activeTrackColor = Purple))
        }

        PanelCard("ข้อมูลที่จะโชว์ (แบบเต็ม)", help = "ปิดบรรทัดที่ไม่ใช้ HUD จะเตี้ยลงอัตโนมัติ") {
            Toggle("กราฟ frame time (ดูอาการกระตุก)", cfg.graph) { save { putBoolean("hud_graph", it) } }
            Toggle("GPU — ชื่อ, % โหลด, MHz, อุณหภูมิ", cfg.gpu) { save { putBoolean("hud_gpu", it) } }
            Toggle("CPU — % ทั้งเครื่อง, % ของเกม, GHz, อุณหภูมิ", cfg.cpu) { save { putBoolean("hud_cpu", it) } }
            Toggle("RAM — ทั้งเครื่อง และที่เกมใช้", cfg.mem) { save { putBoolean("hud_mem", it) } }
            Toggle("วัตต์ + อุณหภูมิแบต + สถานะความร้อน", cfg.power) { save { putBoolean("hud_power", it) } }
        }

        PanelCard(
            "แผงจูนด่วน (แตะ HUD)",
            help = "ปรับเกมที่อยู่บนจอได้ทันทีโดยไม่ต้องออกจากเกม:\n• ล็อก FPS / ความละเอียดเรนเดอร์ — ใช้ Game Mode ของ Android 13+ เกมต้องเปิดใหม่ถึงมีผล และบางเกมปิดฟีเจอร์นี้ไว้ (ดูผลจริงได้จาก HUD)\n• โหมดเกม — Performance / Standard / Battery\n• รีเฟรชเรตจอ — ล็อก Hz กันจอลดเองระหว่างเล่น\n• ล้าง RAM — ปิดแอปเบื้องหลัง แสดง MB ที่ได้คืน\n• อัดเซสชัน — เก็บผลไว้เทียบ\nทุกอย่างต้องเชื่อม ADB ในตัวก่อน"
        ) {
            Body("ใช้ได้ทันทีที่เปิด HUD — แตะที่ HUD 1 ครั้ง", Color.White)
        }
    }
}

@Composable
fun Toggle(label: String, on: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = Color.White, modifier = Modifier.weight(1f))
        Switch(on, onChange, colors = SwitchDefaults.colors(checkedTrackColor = Cyan))
    }
}

@Composable
fun LabScreen() {
    var sub by remember { mutableStateOf(0) }
    androidx.compose.foundation.layout.Column {
        Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("เบนช์มาร์ก GPU", "ไดรเวอร์ Vulkan").forEachIndexed { i, n ->
                FilterChip(sub == i, { sub = i }, label = { Text(n) },
                    colors = FilterChipDefaults.filterChipColors(selectedContainerColor = Cyan, selectedLabelColor = Bg))
            }
        }
        Box(Modifier.weight(1f)) { if (sub == 0) BenchScreen() else DriverScreen() }
    }
}
