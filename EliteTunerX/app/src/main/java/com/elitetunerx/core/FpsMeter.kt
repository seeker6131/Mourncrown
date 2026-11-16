package com.elitetunerx.core

import android.os.SystemClock

/**
 * Measures the real frame rate of the focused app from SurfaceFlinger's present
 * timestamps (`dumpsys SurfaceFlinger --latency <layer>`). These are the exact times each
 * frame of the layer reached the display, so FPS and frame-times derived from them are what
 * the user actually sees. Requires the shell user (built-in ADB, root or Shizuku).
 */
object FpsMeter {
    data class Result(
        val frameTimesMs: List<Double>,
        val displayFps: Double?,
        val pkg: String?,
        val layer: String?,
        val source: String,
    )

    const val SRC_LAYER = "SurfaceFlinger present timestamps"
    const val SRC_FLIP = "SurfaceFlinger page-flip counter (whole display)"
    const val SRC_STATS = "SurfaceFlinger TimeStats (per app)"

    @Volatile private var pkg: String? = null
    @Volatile private var layer: String? = null
    private var lastTs = 0L
    private var lastFocusCheck = 0L
    private var lastLayerPick = 0L
    @Volatile private var emptyPolls = 0
    private var flipCount = -1L
    private var flipAt = 0L

    @Synchronized
    fun reset() {
        pkg = null; layer = null; lastTs = 0; lastFocusCheck = 0; lastLayerPick = 0; emptyPolls = 0; flipCount = -1
    }

    val currentLayer: String? get() = layer
    /** Changes every time the foreground app changes, so callers can drop old frames. */
    @Volatile var changeId = 0
    @Volatile private var noLatency = false

    /**
     * Slow lane (≈1×/s, its own coroutine): which app is on screen, which layer is its.
     * Kept out of [poll] so heavy dumpsys calls never delay the FPS readings.
     */
    fun slow() {
        val now = SystemClock.elapsedRealtime()
        if (pkg == null || now - lastFocusCheck > 900) {
            lastFocusCheck = now
            val p = focusedPackage()
            if (p != null && p != pkg) {
                layer = null; noLatency = false; pkg = p
                resetPending = true
                changeId++
            }
        }
        val p = pkg
        if (p != null && !noLatency && (layer == null || emptyPolls >= 6 || now - lastLayerPick > 15000)) {
            lastLayerPick = now
            emptyPolls = 0
            val l = pickLayer(p)
            if (l != layer) { layer = l; resetPending = true }
            // No layer of this app answers --latency: stop retrying, use TimeStats.
            if (l == null) noLatency = true
        }
    }

    @Volatile private var resetPending = false

    /** Fast lane (every 250 ms): new frames of the current app. */
    @Synchronized
    fun poll(): Result {
        val now = SystemClock.elapsedRealtime()
        if (resetPending) { resetPending = false; lastTs = 0; tsLast = null }
        val p = pkg
        val l = layer
        if (l != null) {
            val ts = latency(l)
            if (ts.isNotEmpty()) {
                val ft = consume(ts)
                if (ft.isEmpty()) emptyPolls++ else emptyPolls = 0
                return Result(ft, null, p, l, SRC_LAYER)
            }
        }
        // Layer timestamps unavailable (renamed layers on new Android, ANGLE/SurfaceView quirks…):
        // count frames per app with TimeStats instead — matched by package, not by layer name.
        if (p != null) {
            val st = timeStats(p, now)
            if (st != null) return st
        }
        // Whole-display page flips only when we can't tell which app is on screen —
        // otherwise they keep counting other layers after the game closes.
        if (p != null) return Result(emptyList(), null, p, null, SRC_STATS)
        val f = pageFlips()
        var fps: Double? = null
        if (f != null) {
            if (flipCount >= 0 && now > flipAt && f >= flipCount) fps = (f - flipCount) * 1000.0 / (now - flipAt)
            flipCount = f
            flipAt = now
        }
        return Result(emptyList(), fps, p, null, SRC_FLIP)
    }

    private fun consume(ts: List<Long>): List<Double> {
        if (lastTs == 0L) {
            // First look at a layer: SurfaceFlinger already holds the last ~128 presented frames,
            // so the real FPS is available immediately instead of after a warm-up.
            val last = ts.last()
            lastTs = last
            if (System.nanoTime() - last > 1_000_000_000L) return emptyList()
            val recent = ts.filter { it >= last - 1_000_000_000L }
            val out = ArrayList<Double>(recent.size)
            for (i in 1 until recent.size) out.add((recent[i] - recent[i - 1]) / 1e6)
            return out
        }
        val fresh = ts.filter { it > lastTs }
        if (fresh.isEmpty()) return emptyList()
        // SurfaceFlinger keeps ~128 frames. If the oldest kept frame is newer than the last one we saw,
        // frames were dropped from the history between polls; only use intervals we really observed.
        val overflow = ts.first() > lastTs
        val seq = if (overflow) fresh else listOf(lastTs) + fresh
        lastTs = fresh.last()
        val out = ArrayList<Double>(seq.size)
        for (i in 1 until seq.size) out.add((seq[i] - seq[i - 1]) / 1e6)
        return out
    }

    fun focusedPackage(): String? {
        val r = Shell.sh("dumpsys window | grep -E 'mCurrentFocus|mFocusedApp' | head -n 4", 4000)
        return Regex("u\\d+ ([A-Za-z][\\w.]*)/").find(r.out)?.groupValues?.get(1)
    }

    private fun latency(layer: String): List<Long> {
        val r = Shell.exec(arrayOf("dumpsys", "SurfaceFlinger", "--latency", layer), 3000)
        val out = ArrayList<Long>(128)
        r.out.lineSequence().drop(1).forEach { line ->
            val parts = line.trim().split(Regex("\\s+"))
            if (parts.size >= 3) {
                val present = parts[1].toLongOrNull()
                if (present != null && present > 0 && present != Long.MAX_VALUE) out.add(present)
            }
        }
        out.sort()
        return out
    }

    private fun pickLayer(pkg: String): String? {
        val all = Shell.exec(arrayOf("dumpsys", "SurfaceFlinger", "--list"), 4000).out.lines()
            .map { it.trim() }
            .filter { it.contains(pkg) && !it.startsWith("Background for") && !it.contains("Bounds for") }
        if (all.isEmpty()) return null
        val ranked = all.sortedByDescending {
            (if (it.contains("SurfaceView")) 4 else 0) + (if (it.contains("BLAST")) 2 else 0) + (if (it.contains("#")) 1 else 0)
        }.take(8)
        var best: String? = null
        var bestScore = -1L
        val nowNs = System.nanoTime()
        // Some Android versions list "Name#id(BLAST Consumer)id" but track latency under a shorter name.
        val variants = ranked.flatMap { n ->
            listOf(n, n.substringBefore("(BLAST Consumer)").trim(), n.substringBefore('#').trim()).distinct()
        }.distinct().take(16)
        for (c in variants) {
            val ts = latency(c)
            if (ts.size < 2) continue
            val last = ts.last()
            val recent = if (nowNs - last < 2_000_000_000L) ts.count { it > last - 1_000_000_000L }.toLong() else 0L
            if (recent > bestScore) {
                bestScore = recent; best = c
            }
        }
        return best
    }

    // ------------------------------------------------------------------ TimeStats fallback
    private var tsEnabled = false
    private var tsAt = 0L
    private var tsLast: Result? = null

    /** Stops the global TimeStats collection we switched on (call when monitoring stops). */
    fun stopTimeStats() {
        if (tsEnabled) runCatching { Shell.exec(arrayOf("dumpsys", "SurfaceFlinger", "--timestats", "-disable", "-clear"), 3000) }
        tsEnabled = false
    }

    private fun timeStats(pkg: String, now: Long): Result? {
        if (!tsEnabled) {
            Shell.exec(arrayOf("dumpsys", "SurfaceFlinger", "--timestats", "-enable", "-clear"), 3000)
            tsEnabled = true; tsAt = now
            return null
        }
        // TimeStats needs a window to count in; keep the previous result between dumps.
        if (now - tsAt < 230) return tsLast?.copy(frameTimesMs = emptyList())
        val out = Shell.exec(arrayOf("dumpsys", "SurfaceFlinger", "--timestats", "-dump", "-clear"), 3000).out
        val elapsedS = (now - tsAt) / 1000.0
        tsAt = now
        val r = parseTimeStats(out, pkg, elapsedS)
        tsLast = r
        return r
    }

    /** Picks the busiest layer of [pkg] and rebuilds its frame times from the present-to-present histogram. */
    fun parseTimeStats(out: String, pkg: String, elapsedS: Double): Result? {
        if (out.isBlank()) return null
        var bestFrames = -1
        var bestHist: List<Double> = emptyList()
        var bestName: String? = null
        var name: String? = null
        var pkgName: String? = null
        var frames = 0
        var inHist = false
        val hist = ArrayList<Double>()
        fun flush() {
            val n = name
            if (n != null && (pkgName == pkg || n.contains(pkg)) && frames > bestFrames) {
                bestFrames = frames; bestName = n; bestHist = ArrayList(hist)
            }
        }
        val kv = Regex("(\\d+)ms=(\\d+)")
        for (raw in out.lineSequence()) {
            val line = raw.trim()
            when {
                line.startsWith("layerName") -> {
                    flush()
                    name = line.substringAfter('=').trim(); pkgName = null; frames = 0; hist.clear(); inHist = false
                }
                line.startsWith("packageName") -> pkgName = line.substringAfter('=').trim()
                line.startsWith("totalFrames") -> frames = line.substringAfter('=').trim().toIntOrNull() ?: 0
                line.startsWith("present2present histogram") -> inHist = true
                line.endsWith("histogram is as below:") -> inHist = false
                inHist && kv.containsMatchIn(line) -> kv.findAll(line).forEach { m ->
                    val ms = m.groupValues[1].toDouble(); val c = m.groupValues[2].toInt()
                    repeat(minOf(c, 1000)) { hist.add(ms) }
                }
            }
        }
        flush()
        if (bestName == null || bestFrames < 0) return null
        // Frame times: from the histogram if present (1 ms buckets), else even spacing.
        val ft = if (bestHist.isNotEmpty()) bestHist.shuffled(java.util.Random(bestFrames.toLong()))
        else if (bestFrames > 0) List(bestFrames) { elapsedS * 1000.0 / bestFrames } else emptyList()
        val fps = if (elapsedS > 0) bestFrames / elapsedS else null
        return Result(ft, fps, pkg, bestName, SRC_STATS)
    }

    private fun pageFlips(): Long? {
        val r = Shell.exec(arrayOf("service", "call", "SurfaceFlinger", "1013"), 3000)
        val m = Regex("Parcel\\(\\s*([0-9a-fA-F]{8})\\s+([0-9a-fA-F]{8})").find(r.out) ?: return null
        return m.groupValues[2].toLongOrNull(16)
    }
}
