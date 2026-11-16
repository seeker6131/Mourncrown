package com.elitetunerx.core

import android.os.Build
import android.os.SystemClock

/**
 * Vendor-neutral GPU load from Android's GPU work period accounting (`dumpsys gpu --gpuwork`,
 * Android 13+, kernel tracepoint `power/gpu_work_period`). Used only when the GPU driver's own
 * sysfs load node is hidden by the firmware (e.g. some HyperOS / One UI builds).
 */
object GpuWork {
    private var prevAt = 0L
    private var last: Double? = null

    fun available(): Boolean {
        if (Build.VERSION.SDK_INT < 33) return false
        return parse(Shell.exec(arrayOf("dumpsys", "gpu", "--gpuwork"), 4000).out) != null
    }

    private val prefix = Regex("^\\[[^\\]]*\\]")

    /** uid → total active ns. Rows may start with "[errors:N]" (seen on Android 16). */
    fun parse(out: String): Map<Int, Long>? {
        if (!out.contains("active", ignoreCase = true)) return null
        val m = HashMap<Int, Long>()
        out.lineSequence().forEach { raw ->
            val line = raw.trim().replace(prefix, "").trim()
            val n = line.split(Regex("\\s+")).mapNotNull { it.toLongOrNull() }
            // gpu_id uid total_active_duration_ns total_inactive_duration_ns
            if (n.size >= 4) m[n[1].toInt()] = (m[n[1].toInt()] ?: 0L) + n[2]
        }
        return m.ifEmpty { null }
    }

    private var prev: Map<Int, Long>? = null

    /** GPU busy % of the last interval for each uid (only uids that were active). */
    @Volatile var perUid: Map<Int, Double> = emptyMap()
        private set

    /** Whole-GPU busy %: per-app periods can overlap, so the sum is capped at 100. */
    fun sample(): Double? {
        val now = SystemClock.elapsedRealtimeNanos()
        val cur = parse(Shell.exec(arrayOf("dumpsys", "gpu", "--gpuwork"), 4000).out) ?: return null
        val p = prev; val pt = prevAt
        prev = cur; prevAt = now
        if (p == null || now <= pt) return last
        val dt = (now - pt).toDouble()
        val shares = HashMap<Int, Double>()
        var total = 0.0
        cur.forEach { (uid, a) ->
            val d = a - (p[uid] ?: a)
            if (d > 0) { val pct = d / dt * 100.0; shares[uid] = pct.coerceAtMost(100.0); total += pct }
        }
        perUid = shares
        last = total.coerceIn(0.0, 100.0)
        return last
    }
}
