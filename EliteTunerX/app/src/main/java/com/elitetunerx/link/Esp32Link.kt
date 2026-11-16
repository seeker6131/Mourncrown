package com.elitetunerx.link

import android.content.Context
import android.net.wifi.WifiManager
import com.elitetunerx.Prefs
import com.elitetunerx.core.Snapshot
import com.elitetunerx.core.Telemetry
import com.elitetunerx.session.Recorder
import com.elitetunerx.tune.QuickActions
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.security.SecureRandom

/**
 * Streams live telemetry to an ESP32 (or anything on the same Wi-Fi) as small JSON UDP packets,
 * and accepts tuning commands back. Protocol (v1):
 *
 *  phone → ESP32, port 4210, every 250 ms:
 *    {"v":1,"key":"AB12CD","fps":59.8,"ft":16.7,"res":"1920x1080","hz":120,"api":"Vulkan",
 *     "game":"Genshin Impact","gpu":63,"gpuMhz":850,"gpuT":52.1,"gpuName":"Adreno 830",
 *     "cpu":41,"cpuGhz":3.53,"cpuT":60.2,"gameCpu":22,"ram":7.8,"ramT":12,"gameRamMb":2100,
 *     "w":6.2,"batT":38.5,"th":"Nominal","rec":false}
 *
 *  ESP32 → phone, port 4211:
 *    {"key":"AB12CD","cmd":"fps","value":"60"}      cmd: fps | scale | mode | hz | ram | rec | hello
 *  phone answers to the sender:  {"key":"AB12CD","ack":"fps","msg":"✔ ..."}
 *
 * The ESP32 learns the phone's IP from the first broadcast; after a "hello" the phone sends
 * unicast to that ESP32 (saves air time). Packets without the right key are ignored.
 */
object Esp32Link {
    const val OUT_PORT = 4210
    const val IN_PORT = 4211

    val running = MutableStateFlow(false)
    val status = MutableStateFlow("ปิดอยู่")
    val peer = MutableStateFlow<String?>(null)

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var jobs = listOf<Job>()
    private var sock: DatagramSocket? = null
    private var lock: WifiManager.MulticastLock? = null

    fun enabled(ctx: Context) = Prefs.get(ctx).getBoolean("esp_on", false)
    fun setEnabled(ctx: Context, on: Boolean) = Prefs.get(ctx).edit().putBoolean("esp_on", on).apply()

    fun key(ctx: Context): String {
        val p = Prefs.get(ctx)
        p.getString("esp_key", null)?.let { return it }
        val chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        val r = SecureRandom()
        val k = (1..6).map { chars[r.nextInt(chars.length)] }.joinToString("")
        p.edit().putString("esp_key", k).apply()
        return k
    }

    fun newKey(ctx: Context): String { Prefs.get(ctx).edit().remove("esp_key").apply(); return key(ctx) }

    /** Optional fixed ESP32 IP (otherwise broadcast). */
    fun targetIp(ctx: Context): String = Prefs.get(ctx).getString("esp_ip", "") ?: ""
    fun setTargetIp(ctx: Context, ip: String) = Prefs.get(ctx).edit().putString("esp_ip", ip.trim()).apply()

    @Synchronized
    fun start(ctx: Context) {
        if (running.value) return
        val app = ctx.applicationContext
        val s = runCatching { DatagramSocket(null).apply { reuseAddress = true; broadcast = true; bind(InetSocketAddress(IN_PORT)) } }
            .getOrElse { status.value = "เปิดพอร์ต $IN_PORT ไม่ได้: ${it.message}"; return }
        sock = s
        lock = runCatching {
            app.getSystemService(WifiManager::class.java).createMulticastLock("etx-esp32").apply { setReferenceCounted(false); acquire() }
        }.getOrNull()
        running.value = true
        status.value = "กำลังส่งข้อมูล (UDP $OUT_PORT)"
        Telemetry.acquire(app)
        jobs = listOf(scope.launch { sender(app, s) }, scope.launch { receiver(app, s) })
    }

    @Synchronized
    fun stop() {
        if (!running.value) return
        jobs.forEach { it.cancel() }; jobs = emptyList()
        runCatching { sock?.close() }; sock = null
        runCatching { lock?.release() }; lock = null
        Telemetry.release()
        running.value = false
        status.value = "ปิดอยู่"
    }

    private suspend fun sender(ctx: Context, s: DatagramSocket) {
        val k = key(ctx)
        while (kotlinx.coroutines.currentCoroutineContext().isActive) {
            val snap = Telemetry.snapshot.value
            if (snap != null) {
                val bytes = json(snap, k).toString().toByteArray()
                val dest = peer.value ?: targetIp(ctx).ifBlank { "255.255.255.255" }
                runCatching { s.send(DatagramPacket(bytes, bytes.size, InetAddress.getByName(dest), OUT_PORT)) }
                    .onFailure { status.value = "ส่งไม่ได้: ${it.message}" }
            }
            delay(250)
        }
    }

    private fun receiver(ctx: Context, s: DatagramSocket) {
        val buf = ByteArray(1024)
        val k = key(ctx)
        while (!s.isClosed) {
            val pkt = DatagramPacket(buf, buf.size)
            runCatching { s.receive(pkt) }.onFailure { return }
            val msg = runCatching { JSONObject(String(pkt.data, 0, pkt.length)) }.getOrNull() ?: continue
            if (msg.optString("key") != k) continue
            val from = pkt.address.hostAddress ?: continue
            peer.value = from
            status.value = "เชื่อม ESP32 แล้ว ($from)"
            val cmd = msg.optString("cmd")
            if (cmd.isEmpty() || cmd == "hello") continue
            val res = runCatching { QuickActions.run(ctx, cmd, msg.optString("value").ifEmpty { null }) }.getOrElse { "✖ ${it.message}" }
            val ack = JSONObject().put("key", k).put("ack", cmd).put("msg", res).toString().toByteArray()
            runCatching { s.send(DatagramPacket(ack, ack.size, pkt.address, OUT_PORT)) }
        }
    }

    fun json(s: Snapshot, key: String): JSONObject = JSONObject().apply {
        put("v", 1); put("key", key)
        s.fps.value?.let { put("fps", r1(it)) }
        s.frameTime.value?.let { put("ft", r1(it)) }
        s.game?.let { g ->
            put("game", g.label)
            if (g.renderW != null) put("res", "${g.renderW}x${g.renderH}")
            g.refreshHz?.let { put("hz", Math.round(it)) }
            g.api?.let { put("api", it) }
            g.cpuPct?.let { put("gameCpu", Math.round(it)) }
            g.ramMb?.let { put("gameRamMb", Math.round(it)) }
        }
        put("gpuName", s.gpuName)
        s.gpuBusy.value?.let { put("gpu", Math.round(it)) }
        s.gpuFreq.value?.let { put("gpuMhz", Math.round(it)) }
        s.gpuTemp.value?.let { put("gpuT", r1(it)) }
        s.cpuUsage.value?.let { put("cpu", Math.round(it)) }
        s.clusters.mapNotNull { it.curMhz }.maxOrNull()?.let { put("cpuGhz", Math.round(it / 10.0) / 100.0) }
        s.cpuTemp.value?.let { put("cpuT", r1(it)) }
        put("ram", r1(s.ramUsedGb)); put("ramT", Math.round(s.ramTotalGb))
        s.power.value?.let { put("w", r1(it)) }
        s.batteryTemp.value?.let { put("batT", r1(it)) }
        put("th", s.thermalStatus)
        put("rec", Recorder.active.value != null)
    }

    private fun r1(v: Double) = Math.round(v * 10) / 10.0
}
