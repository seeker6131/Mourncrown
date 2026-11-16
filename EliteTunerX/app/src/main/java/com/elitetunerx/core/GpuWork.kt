package com.elitetunerx.core

import android.os.Build
import android.os.SystemClock

/**
 * Vendor-neutral GPU load from Android's GPU work period accounting (`dumpsys gpu --gpuwork`,
 * Android 13+, kernel tracepoint `power/gpu_work_period`). Used only when the GPU driver's own
 * sysfs load node is hidden by the firmware (e.g. some HyperOS / One UI builds).
 */
object GpuWork {
    private var prevActive = -1L
    private var prevAt = 0L
    private var last: Double? = null

    fun available(): Boolean {
        if (Build.VERSION.SDK_INT < 33) return false
        return parse(Shell.exec(arrayOf("dumpsys", "gpu", "--gpuwork"), 4000).out) != null
    }

    /** Sum of active ns over all uids, or null when the dump has no usable table. */
    private fun parse(out: String): Long? {
        if (!out.contains("active", ignoreCase = true)) return null
        var sum = 0L
        var rows = 0
        out.lineSequence().forEach { line ->
            val n = line.trim().split(Regex("\\s+")).mapNotNull { it.toLongOrNull() }
            // gpu_id uid total_active_duration_ns total_inactive_duration_ns
            if (n.size >= 4) { sum += n[2]; rows++ }
        }
        return if (rows > 0) sum else null
    }

    fun sample(): Double? {
        val now = SystemClock.elapsedRealtimeNanos()
        val active = parse(Shell.exec(arrayOf("dumpsys", "gpu", "--gpuwork"), 4000).out) ?: return null
        val pa = prevActive; val pt = prevAt
        prevActive = active; prevAt = now
        if (pa < 0 || now <= pt || active < pa) return last
        last = ((active - pa).toDouble() / (now - pt) * 100.0).coerceIn(0.0, 100.0)
        return last
    }
}
