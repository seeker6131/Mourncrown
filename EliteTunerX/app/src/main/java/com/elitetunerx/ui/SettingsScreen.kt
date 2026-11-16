package com.elitetunerx.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import android.os.Build
import android.provider.Settings
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.elitetunerx.BuildConfig
import com.elitetunerx.adb.AdbLink
import com.elitetunerx.adb.AdbState
import com.elitetunerx.adb.PairService
import com.elitetunerx.core.DeviceInfo
import com.elitetunerx.core.GpuInfo
import com.elitetunerx.core.Shell
import com.elitetunerx.link.Esp32Link
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import rikka.shizuku.Shizuku

/** Tiny navigator: 5 bottom tabs + full-screen settings pages. */
object Nav {
    const val TAB_HOME = 0
    const val TAB_HUD = 1
    const val TAB_TUNE = 2
    const val TAB_LAB = 3
    const val TAB_SESSIONS = 4
    const val SETTINGS = "settings"
    const val CONNECT = "connect"
    const val ESP32 = "esp32"
    const val ABOUT = "about"

    val tab = mutableIntStateOf(TAB_HOME)
    val overlay = mutableStateOf<String?>(null)
    private val stack = ArrayList<String>()

    fun go(t: Int) { overlay.value = null; stack.clear(); tab.intValue = t }
    fun open(route: String) { overlay.value?.let { stack += it }; overlay.value = route }
    fun close() { overlay.value = stack.removeLastOrNull() }
}

/** Shown wherever a feature needs the privileged shell. */
@Composable
fun ConnectBanner() {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Warn.copy(alpha = 0.10f))
            .clickable { Nav.open(Nav.CONNECT) }.padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Text("⚠ ยังไม่ได้เชื่อม ADB ในตัว", color = Warn, fontWeight = FontWeight.Bold, fontSize = 14.sp)
        Body("ตอนนี้วัดได้แค่ค่าพื้นฐาน (RAM, อุณหภูมิ, วัตต์, ความถี่ CPU) — FPS, ความละเอียดเกม, GPU % และการจูนต้องเชื่อมก่อน ตั้งครั้งเดียว ไม่ต้องลง Shizuku ไม่ต้องรูท", Color.White)
        Text("แตะเพื่อตั้งค่า →", color = Cyan, fontSize = 12.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun SettingsScreen(route: String) {
    when (route) {
        Nav.CONNECT -> ConnectPage()
        Nav.ESP32 -> Esp32Page()
        Nav.ABOUT -> AboutPage()
        else -> SettingsMenu()
    }
}

@Composable
private fun BackRow(title: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        SecondaryButton("← กลับ") { Nav.close() }
        Text(title, color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 12.dp))
    }
}

@Composable
private fun MenuItem(title: String, sub: String, onClick: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Panel).clickable(onClick = onClick).padding(16.dp)
    ) {
        Text(title, color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold)
        Body(sub)
    }
}

@Composable
private fun SettingsMenu() {
    val adb by AdbLink.state.collectAsState()
    val esp by Esp32Link.status.collectAsState()
    ScreenColumn {
        BackRow("ตั้งค่า")
        MenuItem("การเชื่อมต่อระบบ (ADB ในตัว)", "สถานะ: ${Shell.backend().label} • ${adb.label}") { Nav.open(Nav.CONNECT) }
        MenuItem("ESP32 / อุปกรณ์ภายนอก", "จอแสดงผลและปุ่มจูนภายนอกผ่าน Wi-Fi • $esp") { Nav.open(Nav.ESP32) }
        MenuItem("เกี่ยวกับแอป", "เวอร์ชัน ${BuildConfig.VERSION_NAME} • ข้อมูลเครื่อง • ไลเซนส์") { Nav.open(Nav.ABOUT) }
    }
}

// ====================================================================== CONNECT
@Composable
private fun ConnectPage() {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val adb by AdbLink.state.collectAsState()
    val pairPort by AdbLink.pairPort.collectAsState()
    var backend by remember { mutableStateOf(Shell.backend()) }
    var wd by remember { mutableStateOf(AdbLink.wirelessDebuggingOn(ctx)) }
    var result by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var port by remember { mutableStateOf("") }
    LaunchedEffect(Unit) { while (true) { backend = Shell.backend(); wd = AdbLink.wirelessDebuggingOn(ctx); delay(1000) } }
    val notifPerm = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { PairService.start(ctx) }

    fun run(block: () -> String) {
        result = "กำลังทำ…"
        scope.launch { result = withContext(Dispatchers.IO) { runCatching(block).getOrElse { "✖ ${it.message}" } } }
    }

    ScreenColumn {
        BackRow("การเชื่อมต่อระบบ")
        PanelCard(
            "สถานะตอนนี้",
            help = "แอปต้องมี \"สิทธิ์ระดับ shell\" เพื่ออ่าน FPS จริงของเกม, ความละเอียดเกม, GPU % และเพื่อจูนเครื่อง ได้มา 3 ทาง (แอปเลือกให้อัตโนมัติ):\n1) Root — ถ้าเครื่องรูทอยู่แล้ว ใช้ได้ทันที\n2) ADB ในตัว — แอปต่อกับ Wireless debugging ของเครื่องตัวเอง (เหมือนต่อคอมแต่ไม่ต้องใช้คอม) ไม่ต้องลงแอปอื่น ไม่ต้องรูท\n3) Shizuku — ถ้าคุณใช้อยู่แล้วก็ใช้ร่วมได้ แต่ไม่จำเป็น"
        ) {
            StatusPill(
                when (backend) {
                    Shell.Backend.NONE -> "ยังไม่มีสิทธิ์ระบบ — ใช้ได้บางส่วน"
                    else -> "ใช้งานได้เต็ม ผ่าน ${backend.label}"
                },
                if (backend == Shell.Backend.NONE) Warn else Good
            )
            Body("ADB ในตัว: ${adb.label}" + ((adb as? AdbState.Failed)?.why?.let { "\n$it" } ?: ""), if (adb is AdbState.Failed) Warn else Color.White)
            if (Build.VERSION.SDK_INT >= 30) Body("Wireless debugging: ${if (wd) "เปิดอยู่" else "ปิดอยู่"}" +
                if (AdbLink.canToggleWirelessDebugging(ctx)) " • แอปเปิดเองได้หลังรีบูต ✔" else "")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PrimaryButton("เชื่อมต่อ") { run { if (AdbLink.connect(ctx)) "✔ เชื่อมแล้ว" else "✖ " + ((AdbLink.state.value as? AdbState.Failed)?.why ?: "ไม่สำเร็จ") } }
                if (AdbLink.connected) SecondaryButton("ตัดการเชื่อม") { run { AdbLink.disconnect(); "ตัดการเชื่อมแล้ว" } }
                SecondaryButton("ลองรูท") { run { if (Shell.probeRoot()) "✔ ใช้ Root" else "✖ เครื่องนี้ไม่ได้รูท (ไม่เป็นไร ใช้ ADB ในตัวได้)" } }
            }
            if (result.isNotEmpty()) Mono(result, if (result.startsWith("✖")) Bad else Good)
        }

        if (Build.VERSION.SDK_INT >= 30) PanelCard(
            "ตั้งค่าครั้งแรก (Android 11 ขึ้นไป)",
            help = "ทำครั้งเดียวจบ หลังจากนี้แอปเชื่อมเองทุกครั้งที่เปิด\n• ต้องต่อ Wi-Fi (เน็ตอะไรก็ได้ ไม่ต้องมีอินเทอร์เน็ตก็ได้ แค่ต่อเราเตอร์) เพราะ Android เปิด Wireless debugging ได้เฉพาะตอนต่อ Wi-Fi\n• รีบูตแล้ว Wireless debugging จะปิด แอปจะเปิดกลับให้อัตโนมัติ (ได้สิทธิ์นี้ตอนจับคู่สำเร็จ)\n• ข้อมูลไม่ออกไปไหน แอปคุยกับเครื่องตัวเองผ่าน 127.0.0.1 เท่านั้น"
        ) {
            Step(1, "เปิด \"ตัวเลือกสำหรับนักพัฒนา\": ตั้งค่า → เกี่ยวกับโทรศัพท์ → แตะ \"หมายเลขบิลด์\" (HyperOS: \"เวอร์ชัน OS\" • One UI: ข้อมูลซอฟต์แวร์ → หมายเลขบิลด์) 7 ครั้ง")
            Step(2, "ต่อ Wi-Fi แล้วเปิด \"การแก้ไขข้อบกพร่องแบบไร้สาย\" (Wireless debugging) ในตัวเลือกนักพัฒนา", wd)
            Step(3, "กด \"เริ่มจับคู่\" ด้านล่าง → แอปจะขึ้นการแจ้งเตือน")
            Step(4, "ในหน้า Wireless debugging กด \"จับคู่อุปกรณ์ด้วยรหัสจับคู่\" → ดึงแถบแจ้งเตือนลง → กด \"ใส่รหัส\" พิมพ์รหัส 6 หลัก", AdbLink.connected)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PrimaryButton("เริ่มจับคู่") {
                    if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
                        notifPerm.launch(Manifest.permission.POST_NOTIFICATIONS)
                    else PairService.start(ctx)
                }
                SecondaryButton("เปิดตัวเลือกนักพัฒนา") {
                    runCatching { ctx.startActivity(Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                }
            }
            Body("หรือใส่รหัสตรงนี้ (ถ้าใช้แบ่งจอ 2 แอป)", Color.White)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(code, { code = it.filter(Char::isDigit).take(6) }, singleLine = true, label = { Text("รหัส 6 หลัก") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.weight(1f))
                OutlinedTextField(port, { port = it.filter(Char::isDigit).take(5) }, singleLine = true, label = { Text(pairPort?.let { "พอร์ต $it" } ?: "พอร์ต (ไม่บังคับ)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.weight(1f))
            }
            PrimaryButton("จับคู่ด้วยรหัสนี้", enabled = code.length == 6) { run { AdbLink.pair(ctx, code, port.toIntOrNull()) } }
        }

        PanelCard(
            if (Build.VERSION.SDK_INT >= 30) "Android 8–10 หรือไม่มี Wi-Fi" else "ตั้งค่าครั้งแรก (Android 8–10)",
            help = "Android 10 ลงไปไม่มี Wireless debugging ต้องใช้คอมเปิดโหมด ADB TCP 1 ครั้งต่อการรีบูต แล้วแอปจะต่อ 127.0.0.1:5555 เอง"
        ) {
            Step(1, "เปิด USB debugging แล้วต่อสายกับคอม")
            Step(2, "บนคอมพิมพ์:  adb tcpip 5555")
            Step(3, "ถอดสาย แล้วกด \"เชื่อมต่อ\" ด้านบน → กดอนุญาตในหน้าต่างที่ขึ้นบนมือถือ")
        }

        if (Shell.shizukuInstalledButNotAllowed()) PanelCard("Shizuku (ไม่บังคับ)") {
            Body("เครื่องนี้มี Shizuku ทำงานอยู่ จะให้แอปใช้ Shizuku ด้วยก็ได้", Color.White)
            SecondaryButton("อนุญาต Shizuku") { runCatching { Shizuku.requestPermission(1001) } }
        }
    }
}

// ====================================================================== ESP32
@Composable
private fun Esp32Page() {
    val ctx = LocalContext.current
    val running by Esp32Link.running.collectAsState()
    val status by Esp32Link.status.collectAsState()
    val peer by Esp32Link.peer.collectAsState()
    var key by remember { mutableStateOf(Esp32Link.key(ctx)) }
    var ip by remember { mutableStateOf(Esp32Link.targetIp(ctx)) }
    ScreenColumn {
        BackRow("ESP32 / อุปกรณ์ภายนอก")
        PanelCard(
            "ส่งข้อมูลไป ESP32",
            help = "ให้ ESP32 (หรือบอร์ดอื่นที่ต่อ Wi-Fi วงเดียวกัน) เป็นจอแสดงผลแยก + ปุ่มจูนจริง:\n• มือถือส่ง FPS, ความละเอียดเกม, GPU, CPU, อุณหภูมิ, วัตต์ เป็น JSON ผ่าน UDP พอร์ต ${Esp32Link.OUT_PORT} ทุก 0.25 วินาที\n• ESP32 ส่งคำสั่งกลับที่พอร์ต ${Esp32Link.IN_PORT} เช่น ล็อก FPS, ลดความละเอียด, ล้าง RAM, เริ่มอัด\n• ต้องใส่ \"รหัสอุปกรณ์\" ตรงกัน คนอื่นใน Wi-Fi เดียวกันสั่งเครื่องคุณไม่ได้\nตัวอย่างโค้ด Arduino อยู่ในโฟลเดอร์ esp32/ ของโปรเจกต์"
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("เปิดใช้งาน", color = Color.White, modifier = Modifier.weight(1f))
                Switch(running, {
                    Esp32Link.setEnabled(ctx, it)
                    if (it) Esp32Link.start(ctx) else Esp32Link.stop()
                }, colors = SwitchDefaults.colors(checkedTrackColor = Cyan))
            }
            Body("สถานะ: $status", if (peer != null) Good else Color.White)
            Text("รหัสอุปกรณ์: $key", color = Cyan, fontSize = 22.sp, fontWeight = FontWeight.Black)
            Body("ใส่รหัสนี้ในโค้ด ESP32 (ตัวแปร ETX_KEY)")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SecondaryButton("สร้างรหัสใหม่") { key = Esp32Link.newKey(ctx); if (running) { Esp32Link.stop(); Esp32Link.start(ctx) } }
            }
            OutlinedTextField(ip, { ip = it; Esp32Link.setTargetIp(ctx, it) }, singleLine = true,
                label = { Text("IP ของ ESP32 (เว้นว่าง = broadcast หาเอง)") }, modifier = Modifier.fillMaxWidth())
        }
        PanelCard("คำสั่งที่ ESP32 ส่งได้") {
            Mono("{\"key\":\"$key\",\"cmd\":\"fps\",\"value\":\"60\"}   ล็อก FPS (0=ปิด)\n" +
                "cmd \"scale\" value \"0.8\"   ความละเอียดเกม 80%\n" +
                "cmd \"mode\"  value \"performance|standard|battery\"\n" +
                "cmd \"hz\"    value \"120\" | \"auto\"   รีเฟรชเรตจอ\n" +
                "cmd \"ram\"                    ล้าง RAM\n" +
                "cmd \"rec\"                    เริ่ม/หยุดอัดเซสชัน\n" +
                "cmd \"hello\"                  ให้มือถือส่งตรงหา ESP32", Color(0xFFC9D6EA))
        }
    }
}

// ====================================================================== ABOUT
@Composable
private fun AboutPage() {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    ScreenColumn {
        BackRow("เกี่ยวกับแอป")
        PanelCard(
            "รายงานวิเคราะห์ (FPS / ความละเอียดไม่ขึ้น)",
            help = "ถ้า FPS หรือความละเอียดขึ้น N/A บนเครื่องคุณ: เปิดเกมก่อน 10 วินาที แล้วกด \"รายงานปัญหา\" ในแผงจูนของ HUD (ดีที่สุด) หรือกดปุ่มนี้ — แอปจะรวบรวมสิ่งที่ระบบรายงานเกี่ยวกับเกมนั้นเท่านั้น (ไม่มีรายชื่อแอปอื่น ไม่มีข้อมูลส่วนตัว) คัดลอกไว้ให้และเปิดหน้าส่งต่อ ส่งให้ผู้พัฒนาเพื่อแก้ให้ตรงกับเครื่องคุณ"
        ) {
            Body("เกมล่าสุด: ${com.elitetunerx.core.GameProbe.lastGame ?: "ยังไม่มี — เปิดเกมก่อน"}", Color.White)
            PrimaryButton(if (busy) "กำลังรวบรวม…" else "สร้างรายงาน", enabled = !busy) {
                busy = true
                scope.launch {
                    val r = withContext(Dispatchers.IO) { com.elitetunerx.core.Diagnostics.build(ctx, com.elitetunerx.core.GameProbe.lastGame) }
                    busy = false
                    com.elitetunerx.core.Diagnostics.share(ctx, r)
                }
            }
        }
        PanelCard("Elite Tuner X ${BuildConfig.VERSION_NAME}") {
            Body("เครื่องมือวัดผลและจูนเกมบน Android • รองรับทุกชิป (Snapdragon, Dimensity, Exynos, Tensor, Unisoc) และทุกสกิน (HyperOS, One UI, ColorOS, OxygenOS, Android ทั่วไป) Android 8 ขึ้นไป", Color.White)
            Body("ทุกค่าที่แสดงอ่านจากระบบจริง ถ้าวัดไม่ได้จะขึ้น N/A — ไม่สุ่ม ไม่เดา")
        }
        PanelCard("ข้อมูลเครื่อง (ใช้แจ้งปัญหา)") {
            val g = GpuInfo.get()
            Mono("Model   ${DeviceInfo.model}\nChip    ${DeviceInfo.chip}\nGPU     ${g.renderer}\nGL      ${g.glVersion}\nSkin    ${DeviceInfo.skin}\nOS      ${DeviceInfo.android}\nABI     ${Build.SUPPORTED_ABIS.joinToString()}", Color(0xFFC9D6EA))
        }
        PanelCard("ไลบรารีโอเพนซอร์สที่ใช้") {
            Body("libadb-android (Apache-2.0) • spake2-android (ดูไลเซนส์ต้นทาง) • Conscrypt (Apache-2.0) • Bouncy Castle (MIT) • Shizuku API (Apache-2.0) • libadrenotools (BSD-2-Clause) • Jetpack Compose (Apache-2.0)")
        }
    }
}
