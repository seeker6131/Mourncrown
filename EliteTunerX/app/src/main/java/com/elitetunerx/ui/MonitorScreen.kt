package com.elitetunerx.ui

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.elitetunerx.Prefs
import com.elitetunerx.core.DeviceInfo
import com.elitetunerx.core.GpuInfo
import com.elitetunerx.core.Reading
import com.elitetunerx.core.Shell
import com.elitetunerx.core.Telemetry
import com.elitetunerx.hud.HudService
import com.elitetunerx.session.Recorder
import kotlinx.coroutines.delay
import java.util.Locale

/** Starts the HUD, asking for the overlay / notification permission first when missing. */
@Composable
fun rememberHudStarter(): () -> Unit {
    val ctx = LocalContext.current
    val notif = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { HudService.start(ctx) }
    return {
        if (!HudService.canDraw(ctx)) {
            ctx.startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${ctx.packageName}")))
        } else if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) notif.launch(Manifest.permission.POST_NOTIFICATIONS)
        else HudService.start(ctx)
    }
}

fun fpsColor(v: Double?) = when {
    v == null -> Muted
    v >= 55 -> Good
    v >= 30 -> Warn
    else -> Bad
}

@Composable
fun HomeScreen() {
    val ctx = LocalContext.current
    val snap by Telemetry.snapshot.collectAsState()
    val hudRunning by HudService.running.collectAsState()
    val active by Recorder.active.collectAsState()
    var label by remember { mutableStateOf(Prefs.label(ctx)) }
    var tick by remember { mutableIntStateOf(0) }
    LaunchedEffect(active) { while (active != null) { tick++; delay(1000) } }
    val startHud = rememberHudStarter()
    val s = snap
    val na = Reading.na("กำลังเริ่ม…")

    ScreenColumn {
        Header("ELITE TUNER X", "${DeviceInfo.model} • ${DeviceInfo.skin} • ${DeviceInfo.android}") {
            SecondaryButton("⚙") { Nav.open(Nav.SETTINGS) }
        }

        // ---------------- connection banner
        val be = s?.backend ?: Shell.backend()
        if (be == Shell.Backend.NONE) ConnectBanner()
        else Row(verticalAlignment = Alignment.CenterVertically) {
            StatusPill("สิทธิ์ระบบ: ${be.label} — วัดค่าได้เต็ม", Good)
        }

        // ---------------- device card
        PanelCard(
            "ชิปและ GPU ของเครื่องนี้",
            help = "ชื่อ GPU อ่านตรงจากไดรเวอร์กราฟิกของเครื่อง (ค่าเดียวกับที่เกมเห็น) ไม่ได้เดาจากรุ่นมือถือ ใช้ได้กับทุกค่าย: Adreno (Snapdragon), Mali/Immortalis (Dimensity, Exynos รุ่นเก่า, Tensor), Xclipse (Exynos), PowerVR"
        ) {
            val g = remember { GpuInfo.get() }
            Text(GpuInfo.shortName(), color = Cyan, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            Body("${DeviceInfo.chip} • ${g.vendor}", Color.White)
            Body(g.glVersion)
        }

        // ---------------- current game
        PanelCard(
            "เกมที่เปิดอยู่ตอนนี้",
            help = "แอปจะดูว่าเกมไหนอยู่บนจอแล้วดึงข้อมูลจากเกมนั้นอัตโนมัติ ไม่ว่าจะเล่นเกมอะไร:\n• ความละเอียด = ขนาดภาพที่เกมเรนเดอร์จริง (อ่านจาก SurfaceFlinger) เช่น 1920×1080 ถ้าเกมลดความละเอียดเองจะเห็นตัวเลขเปลี่ยน\n• API = เกมใช้ Vulkan หรือ OpenGL ES (จาก GpuStats ของ Android)\n• CPU/RAM ของเกม = ใช้เฉพาะตัวเกม ไม่รวมแอปอื่น\nต้องเชื่อม ADB ในตัวหรือรูทก่อน"
        ) {
            val g = s?.game
            if (g == null) Body(if (be == Shell.Backend.NONE) "ต้องเชื่อม ADB ในตัวก่อนถึงจะรู้ว่าเกมไหนเปิดอยู่" else "เปิดเกมแล้วกลับมาดู — หรือเปิด HUD ทับเกมได้เลย")
            else {
                Text(g.label, color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                Body(g.pkg)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Metric("ความละเอียดเกม", Reading(g.renderW?.toDouble(), g.resText, g.scalePct?.let { "${it}% ของจอ" } ?: "SurfaceFlinger"), Modifier.weight(1f), showSource = true)
                    Metric("API กราฟิก", Reading(if (g.api != null) 1.0 else null, g.api ?: "N/A", "GpuStats"), Modifier.weight(1f), Purple)
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Metric("CPU ของเกม", Reading.of(g.cpuPct, "%.0f", "%", "/proc ของเกม"), Modifier.weight(1f), Purple)
                    Metric("RAM ของเกม", Reading.of(g.ramMb?.div(1024), "%.2f", " GB", "dumpsys meminfo"), Modifier.weight(1f), Purple)
                }
            }
        }

        // ---------------- live numbers
        PanelCard(
            "ค่าสด (อัปเดตทุก 0.5 วินาที)",
            help = "FPS นับจากเวลาที่ภาพแต่ละเฟรมขึ้นจอจริง (ตัวเดียวกับที่ระบบ Android ใช้) จึงแม่นและขึ้นทันทีที่เปิดเกม • GPU % อ่านจากไดรเวอร์ GPU ของแต่ละค่าย ถ้าเฟิร์มแวร์บางรุ่น (เช่น HyperOS บางเวอร์ชัน) ซ่อนไว้ แอปจะใช้ตัวนับ GPU work ของ Android แทน • ถ้าวัดไม่ได้จริงจะขึ้น N/A ไม่มีการเดาตัวเลข"
        ) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                BigStat(s?.fps?.takeIf { it.ok }?.value?.let { String.format(Locale.US, "%.0f", it) } ?: "--", "FPS", s?.frameTime?.text ?: "", fpsColor(s?.fps?.value))
                BigStat(s?.gpuBusy?.takeIf { it.ok }?.value?.let { String.format(Locale.US, "%.0f", it) } ?: "--", "%", "GPU ${s?.gpuFreq?.takeIf { it.ok }?.text ?: ""}", Cyan)
                BigStat(s?.cpuUsage?.takeIf { it.ok }?.value?.let { String.format(Locale.US, "%.0f", it) } ?: "--", "%", "CPU", Purple)
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Metric("GPU TEMP", s?.gpuTemp ?: na, Modifier.weight(1f), Warn)
                Metric("CPU TEMP", s?.cpuTemp ?: na, Modifier.weight(1f), Warn)
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Metric("POWER", s?.power ?: na, Modifier.weight(1f), Pink)
                Metric("BATTERY", s?.batteryTemp ?: na, Modifier.weight(1f), Pink)
            }
            if (s != null) {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    s.clusters.forEach { c ->
                        Mono(String.format(Locale.US, "%-9s %5s / %s MHz", c.name, c.curMhz?.let { "%.0f".format(Locale.US, it) } ?: "N/A",
                            c.maxMhz?.let { "%.0f".format(Locale.US, it) } ?: "?"), Color(0xFFC9D6EA))
                    }
                    Mono(String.format(Locale.US, "RAM       %.2f / %.2f GB", s.ramUsedGb, s.ramTotalGb), Color(0xFFC9D6EA))
                    Mono("Thermal   ${s.thermalStatus}  •  headroom ${s.headroom.text}", if (s.thermalStatus == "Nominal") Good else Warn)
                }
            }
        }

        // ---------------- HUD + recorder
        PanelCard(
            "HUD ทับเกม + อัดเบนช์มาร์ก",
            help = "HUD คือหน้าต่างเล็กลอยทับเกม โชว์ FPS, ความละเอียดเกม, GPU, CPU, อุณหภูมิ, วัตต์\n• แตะ HUD = เปิดแผงจูนด่วน (ล็อก FPS, ลดความละเอียด, โหมดเกม, รีเฟรชเรต, ล้าง RAM)\n• กดค้าง = เปลี่ยนแบบ HUD (เต็ม / แถบ / มินิ)\n• ลาก = ย้ายตำแหน่ง\n\nอัดเซสชัน = เก็บ frame time ทุกเฟรม แล้วสรุป FPS เฉลี่ย, 1% low, อาการกระตุก ไว้เทียบการตั้งค่าแต่ละแบบในหน้า เซสชัน"
        ) {
            OutlinedTextField(
                value = label, onValueChange = { label = it; Prefs.setLabel(ctx, it) }, singleLine = true,
                label = { Text("ชื่อเซสชันถัดไป เช่น Genshin • 60fps • High") }, modifier = Modifier.fillMaxWidth()
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (!hudRunning) PrimaryButton("เปิด HUD", onClick = startHud) else SecondaryButton("ปิด HUD") { HudService.stop(ctx) }
                if (active == null) SecondaryButton("● เริ่มอัด") { Recorder.start(label) }
                else PrimaryButton("■ หยุดอัด") { Recorder.stop(ctx) }
                SecondaryButton("ปรับแต่ง HUD") { Nav.go(Nav.TAB_HUD) }
            }
            active?.let { a ->
                val dur = ((System.currentTimeMillis() - a.startMs) / 1000).toInt() + tick * 0
                Text(String.format(Locale.US, "กำลังอัด: %s • %02d:%02d • %d เฟรม", a.label, dur / 60, dur % 60, synchronized(a) { a.frames.size }),
                    color = Bad, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }
            if (!HudService.canDraw(ctx)) Body("ต้องอนุญาต \"แสดงทับแอปอื่น\" ก่อน — กดเปิด HUD แล้วระบบจะพาไปหน้าตั้งค่า", Warn)
        }
    }
}

fun Context.openUrl(u: String) = runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(u))) }
