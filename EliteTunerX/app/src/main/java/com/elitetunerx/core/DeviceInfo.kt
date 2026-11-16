package com.elitetunerx.core

import android.annotation.SuppressLint
import android.os.Build

/** Phone model, chip and Android skin (HyperOS, One UI, ColorOS…) for the header and support logs. */
object DeviceInfo {
    @SuppressLint("PrivateApi")
    fun prop(key: String): String = runCatching {
        Class.forName("android.os.SystemProperties").getMethod("get", String::class.java).invoke(null, key) as String
    }.getOrDefault("").trim()

    val model: String get() = "${Build.MANUFACTURER.replaceFirstChar { it.uppercase() }} ${Build.MODEL}"

    val chip: String get() {
        val soc = if (Build.VERSION.SDK_INT >= 31) "${Build.SOC_MANUFACTURER} ${Build.SOC_MODEL}".trim() else ""
        return soc.ifBlank { prop("ro.soc.model").ifBlank { Build.HARDWARE } }
    }

    val skin: String by lazy {
        fun p(k: String) = prop(k)
        when {
            p("ro.mi.os.version.name").isNotEmpty() -> "HyperOS ${p("ro.mi.os.version.name")}"
            p("ro.miui.ui.version.name").isNotEmpty() -> "MIUI ${p("ro.miui.ui.version.name")}"
            p("ro.build.version.oneui").isNotEmpty() -> "One UI " + p("ro.build.version.oneui").toIntOrNull()?.let { "${it / 10000}.${it / 100 % 100}" }.orEmpty()
            p("ro.build.version.realmeui").isNotEmpty() -> "realme UI ${p("ro.build.version.realmeui")}"
            p("ro.build.version.opporom").isNotEmpty() -> "ColorOS ${p("ro.build.version.opporom")}"
            p("ro.oxygen.version").isNotEmpty() || p("ro.rom.version").contains("Oxygen", true) -> "OxygenOS"
            p("ro.vivo.os.version").isNotEmpty() -> "OriginOS/Funtouch ${p("ro.vivo.os.version")}"
            p("ro.build.version.magic").isNotEmpty() -> "MagicOS ${p("ro.build.version.magic")}"
            p("ro.build.version.emui").isNotEmpty() -> p("ro.build.version.emui")
            p("ro.lineage.version").isNotEmpty() -> "LineageOS ${p("ro.lineage.version")}"
            p("ro.nothing.version.id").isNotEmpty() || Build.MANUFACTURER.equals("Nothing", true) -> "Nothing OS"
            p("ro.asus.rog").isNotEmpty() || Build.MODEL.contains("ROG", true) -> "ROG UI"
            else -> "Android"
        }
    }

    val android: String get() = "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})"
}
