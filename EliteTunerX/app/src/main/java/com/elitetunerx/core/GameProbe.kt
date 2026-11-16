package com.elitetunerx.core

import android.content.Context
import android.hardware.display.DisplayManager
import android.os.SystemClock
import android.view.Display

/** What is known about the app that is on screen right now. Every field is null when not measurable. */
data class GameInfo(
    val pkg: String,
    val label: String,
    /** Size of the frames the game actually renders (its buffer), e.g. 1920×1080. */
    val renderW: Int?, val renderH: Int?,
    /** Size the frames are shown at on the panel. */
    val screenW: Int?, val screenH: Int?,
    val refreshHz: Double?,
    /** "Vulkan", "OpenGL ES", "ANGLE (GLES→Vulkan)", "Vulkan + GLES"… */
    val api: String?,
    val ramMb: Double?,
    /** Share of the whole CPU used by the game's main process (100% = every core busy). */
    val cpuPct: Double?,
) {
    val resText: String get() = if (renderW != null && renderH != null) "${renderW}×${renderH}" else "N/A"
    val scalePct: Int? get() = if (renderW != null && screenW != null && screenW > 0) {
        val a = maxOf(renderW, renderH ?: 0).toDouble(); val b = maxOf(screenW, screenH ?: 0).toDouble()
        if (b > 0) (a / b * 100).toInt() else null
    } else null
}

/**
 * Reads the foreground game's details from the system (SurfaceFlinger, GpuStats, meminfo, /proc).
 * Works for any game on any vendor — nothing is injected into the game.
 */
object GameProbe {
    @Volatile private var pkg: String? = null
    @Volatile private var label = ""
    @Volatile private var res: IntArray? = null
    private var resAt = 0L
    @Volatile private var api: String? = null
    private var apiAt = 0L
    @Volatile private var ram: Double? = null
    private var ramAt = 0L
    @Volatile private var pids: List<Int> = emptyList()
    private var pidAt = 0L
    private var prevCpu: LongArray? = null
    @Volatile private var cpu: Double? = null

    /** Last app on screen that was not Elite Tuner X itself (for reports opened from the app). */
    @Volatile var lastGame: String? = null

    @Synchronized
    fun reset() { pkg = null }

    /** Slow lane (own coroutine): resolution, API, RAM, process list — heavy dumpsys calls. */
    fun heavy(ctx: Context, layer: String?) {
        val p = pkg ?: return
        val now = SystemClock.elapsedRealtime()
        if (now - resAt > (if (res == null) 2000 else 20000)) { resAt = now; val r = runCatching { resolution(p, layer) }.getOrNull(); if (p == pkg && r != null) res = r }
        if (now - apiAt > (if (api == null) 4000 else 30000)) { apiAt = now; val a = runCatching { graphicsApi(p) }.getOrNull(); if (p == pkg && a != null) api = a }
        if (now - ramAt > 5000) { ramAt = now; val m = runCatching { pss(p) }.getOrNull(); if (p == pkg) ram = m }
        if (pids.isEmpty() || now - pidAt > 10000) { pidAt = now; val ids = runCatching { pidsOf(p) }.getOrDefault(emptyList()); if (p == pkg) pids = ids }
    }

    /** Fast lane: game CPU share + current values. */
    fun poll(ctx: Context, fg: String?, layer: String?, priv: Boolean): GameInfo? {
        val p = fg ?: return null
        if (p != ctx.packageName) lastGame = p
        val now = SystemClock.elapsedRealtime()
        if (p != pkg) {
            pkg = p; res = null; api = null; ram = null; pids = emptyList(); prevCpu = null; cpu = null
            resAt = 0; apiAt = 0; ramAt = 0; pidAt = 0
            label = runCatching {
                val pm = ctx.packageManager
                pm.getApplicationLabel(pm.getApplicationInfo(p, 0)).toString()
            }.getOrDefault(p.substringAfterLast('.'))
        }
        val display = ctx.getSystemService(DisplayManager::class.java).getDisplay(Display.DEFAULT_DISPLAY)
        val hz = display?.refreshRate?.toDouble()
        if (priv) cpu = runCatching { cpuShare() }.getOrNull() ?: cpu
        val r = res
        return GameInfo(
            pkg = p, label = label,
            renderW = r?.get(0), renderH = r?.get(1), screenW = r?.get(2)?.takeIf { it > 0 }, screenH = r?.get(3)?.takeIf { it > 0 },
            refreshHz = hz, api = api, ramMb = ram, cpuPct = cpu,
        )
    }

    // ------------------------------------------------------------------ resolution
    private val numRe = Regex("-?\\d+(?:\\.\\d+)?")

    /** [renderW, renderH, screenW, screenH] */
    private fun resolution(pkg: String, layer: String?): IntArray? {
        val dump = Shell.exec(arrayOf("dumpsys", "SurfaceFlinger"), 6000).out
        if (dump.isEmpty()) return null
        val lines = dump.lines()
        // 1) HWC layer table. Column order differs between Android versions, so find the columns
        //    from the header line ("Disp Frame (LTRB)" / "Source Crop (LTRB)").
        var best: IntArray? = null
        var bestScore = -1.0
        var dispCol = 4; var cropCol = 5
        for (i in 0 until lines.size - 1) {
            val l = lines[i]
            if (l.contains("Source Crop") && l.contains("|")) {
                val cols = l.split('|')
                cols.indexOfFirst { it.contains("Disp Frame") }.takeIf { it >= 0 }?.let { dispCol = it }
                cols.indexOfFirst { it.contains("Source Crop") }.takeIf { it >= 0 }?.let { cropCol = it }
                continue
            }
            val name = l.trim()
            if (!name.contains(pkg) || name.contains("Bounds for") || name.startsWith("Background for") || name.contains("|")) continue
            // the data row is the next line that has the column separators
            val row = (i + 1 until minOf(lines.size, i + 3)).map { lines[it] }.firstOrNull { it.count { c -> c == '|' } >= 4 } ?: continue
            val cols = row.split('|')
            if (cols.size <= maxOf(dispCol, cropCol)) continue
            val disp = numRe.findAll(cols[dispCol]).map { it.value.toDouble() }.toList()
            val crop = numRe.findAll(cols[cropCol]).map { it.value.toDouble() }.toList()
            if (disp.size < 4 || crop.size < 4) continue
            val rw = (crop[2] - crop[0]).toInt(); val rh = (crop[3] - crop[1]).toInt()
            val sw = (disp[2] - disp[0]).toInt(); val sh = (disp[3] - disp[1]).toInt()
            if (rw <= 1 || rh <= 1) continue
            var score = rw.toDouble() * rh
            if (layer != null && name.startsWith(layer.substringBefore('#'))) score *= 4
            if (name.contains("SurfaceView")) score *= 2
            if (score > bestScore) { bestScore = score; best = intArrayOf(rw, rh, sw, sh) }
        }
        if (best != null) return best
        // 2) Per-layer dump: "activeBuffer=[1920x1080:..."
        val bufRe = Regex("(?:activeBuffer=\\[|[bB]uffer(?:Size)?[=:]\\s*\\[?|w/h:)\\s*(\\d{2,5})\\s*x\\s*(\\d{2,5})")
        for (i in lines.indices) {
            val l = lines[i]
            if (!(l.contains("Layer") && l.contains(pkg))) continue
            for (j in i + 1 until minOf(lines.size, i + 50)) {
                val m = bufRe.find(lines[j])
                if (m != null) {
                    val w = m.groupValues[1].toInt(); val h = m.groupValues[2].toInt()
                    if (w > 1 && h > 1) return intArrayOf(w, h, 0, 0)
                    break
                }
                if (lines[j].trimStart().startsWith("* Layer") || lines[j].trimStart().startsWith("+ ")) break
            }
        }
        return null
    }

    // ------------------------------------------------------------------ graphics API (GpuStats)
    private fun graphicsApi(pkg: String): String? {
        val out = Shell.exec(arrayOf("dumpsys", "gpu"), 5000).out
        val i = out.indexOf("appPackageName = $pkg")
        if (i < 0) return null
        val end = out.indexOf("appPackageName = ", i + 10).let { if (it < 0) minOf(out.length, i + 2000) else it }
        val block = out.substring(i, end)
        fun loaded(key: String) = Regex("$key\\s*[:=]\\s*([^\\n]*)").find(block)?.groupValues?.get(1)?.let { numRe.containsMatchIn(it) } == true
        fun flag(key: String) = Regex("$key\\s*=\\s*1").containsMatchIn(block)
        val vk = loaded("vkDriverLoadingTime") || flag("cpuVulkanInUse")
        val gl = loaded("glDriverLoadingTime")
        val angle = flag("angleInUse") || loaded("angleDriverLoadingTime")
        return when {
            angle && vk -> "ANGLE (GLES→Vulkan)"
            vk && gl -> "Vulkan + GLES"
            vk -> "Vulkan"
            gl -> "OpenGL ES"
            else -> null
        }
    }

    // ------------------------------------------------------------------ memory / cpu
    private fun pss(pkg: String): Double? {
        val out = Shell.exec(arrayOf("dumpsys", "meminfo", pkg), 6000).out
        val m = Regex("TOTAL PSS:\\s*(\\d+)").find(out) ?: Regex("(?m)^\\s*TOTAL\\s+(\\d+)").find(out) ?: return null
        return m.groupValues[1].toDouble() / 1024.0
    }

    /** All processes of the app ("pkg", "pkg:render", …) — many games render in a side process. */
    private fun pidsOf(pkg: String): List<Int> =
        Shell.sh("ps -A -o PID,NAME 2>/dev/null || ps", 4000).out.lineSequence()
            .map { it.trim().split(Regex("\\s+")) }
            .filter { it.size >= 2 && (it.last() == pkg || it.last().startsWith("$pkg:")) }
            .mapNotNull { it.first().toIntOrNull() }.toList()

    private fun cpuShare(): Double? {
        val ids = pids
        if (ids.isEmpty()) return null
        val out = Shell.sh(ids.joinToString("; ") { "cat /proc/$it/stat 2>/dev/null" } + "; head -n 1 /proc/stat", 3000).out.lines()
        var proc = 0L
        var seen = 0
        for (l in out) {
            if (l.startsWith("cpu ")) continue
            val f = l.substringAfterLast(')', "").trim().split(Regex("\\s+"))
            // fields after ")" start with state; utime/stime are fields 14/15 → indices 11/12
            val u = f.getOrNull(11)?.toLongOrNull() ?: continue
            proc += u + (f.getOrNull(12)?.toLongOrNull() ?: 0); seen++
        }
        if (seen == 0) { pids = emptyList(); return null }
        val total = out.firstOrNull { it.startsWith("cpu ") }?.trim()?.split(Regex("\\s+"))?.drop(1)
            ?.mapNotNull { it.toLongOrNull() }?.take(8)?.sum() ?: return null
        val prev = prevCpu
        prevCpu = longArrayOf(proc, total)
        if (prev == null || total <= prev[1] || proc < prev[0]) return null
        return ((proc - prev[0]).toDouble() / (total - prev[1]) * 100.0).coerceIn(0.0, 100.0)
    }
}
