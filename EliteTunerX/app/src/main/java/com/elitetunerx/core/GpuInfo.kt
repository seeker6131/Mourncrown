package com.elitetunerx.core

import android.opengl.EGL14
import android.opengl.EGLConfig
import android.opengl.GLES20
import android.os.Build

/**
 * The real GPU name as the driver reports it (e.g. "Adreno (TM) 830", "Mali-G925-Immortalis MC12",
 * "Samsung Xclipse 950", "PowerVR B-Series BXM-8-256"). Read once from a tiny offscreen GL context —
 * works on every vendor without any permission.
 */
object GpuInfo {
    data class Info(val renderer: String, val vendor: String, val glVersion: String, val soc: String)

    @Volatile private var cached: Info? = null

    fun get(): Info = cached ?: synchronized(this) { cached ?: read().also { cached = it } }

    /** Short display name: "Adreno 830", "Mali-G925 MC12", "Xclipse 950"… */
    fun shortName(): String = get().renderer
        .replace("(TM)", "").replace("Immortalis-", "").replace("Qualcomm ", "")
        .replace(Regex("\\s+"), " ").trim()

    private fun soc(): String {
        val model = if (Build.VERSION.SDK_INT >= 31) "${Build.SOC_MANUFACTURER} ${Build.SOC_MODEL}".trim() else ""
        return model.ifBlank { Build.HARDWARE }
    }

    private fun read(): Info {
        var renderer = "Unknown GPU"; var vendor = ""; var ver = ""
        runCatching {
            val dpy = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
            val v = IntArray(2)
            EGL14.eglInitialize(dpy, v, 0, v, 1)
            val attrs = intArrayOf(
                EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT,
                EGL14.EGL_SURFACE_TYPE, EGL14.EGL_PBUFFER_BIT, EGL14.EGL_NONE
            )
            val cfgs = arrayOfNulls<EGLConfig>(1)
            val n = IntArray(1)
            EGL14.eglChooseConfig(dpy, attrs, 0, cfgs, 0, 1, n, 0)
            val ctx = EGL14.eglCreateContext(dpy, cfgs[0], EGL14.EGL_NO_CONTEXT, intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE), 0)
            val surf = EGL14.eglCreatePbufferSurface(dpy, cfgs[0], intArrayOf(EGL14.EGL_WIDTH, 1, EGL14.EGL_HEIGHT, 1, EGL14.EGL_NONE), 0)
            EGL14.eglMakeCurrent(dpy, surf, surf, ctx)
            renderer = GLES20.glGetString(GLES20.GL_RENDERER) ?: renderer
            vendor = GLES20.glGetString(GLES20.GL_VENDOR) ?: ""
            ver = GLES20.glGetString(GLES20.GL_VERSION) ?: ""
            EGL14.eglMakeCurrent(dpy, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT)
            EGL14.eglDestroySurface(dpy, surf)
            EGL14.eglDestroyContext(dpy, ctx)
            EGL14.eglTerminate(dpy)
        }
        return Info(renderer.trim(), vendor.trim(), ver.trim(), soc())
    }
}
