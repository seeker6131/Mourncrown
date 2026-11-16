package com.elitetunerx.adb

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import io.github.muntashirakon.adb.AbsAdbConnectionManager
import io.github.muntashirakon.adb.AdbStream
import io.github.muntashirakon.adb.android.AdbMdns
import kotlinx.coroutines.flow.MutableStateFlow
import org.bouncycastle.asn1.x500.X500Name
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder
import java.io.ByteArrayOutputStream
import java.io.File
import java.math.BigInteger
import java.net.InetAddress
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.PrivateKey
import java.security.cert.Certificate
import java.security.cert.CertificateFactory
import java.security.spec.PKCS8EncodedKeySpec
import java.util.Date
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

/**
 * The app's own ADB client. It connects to this phone's adbd through "Wireless debugging",
 * which gives the same shell user (uid 2000) as a PC with adb — no Shizuku app, no root, no PC.
 *
 * One-time setup: pair with the 6-digit code. After a reboot the app reconnects by itself and,
 * once it was granted WRITE_SECURE_SETTINGS over this connection, it can even switch Wireless
 * debugging back on by itself (needs Wi-Fi to be connected — Android's rule, not ours).
 */
class EtxAdb private constructor(ctx: Context) : AbsAdbConnectionManager() {
    private val dir = File(ctx.filesDir, "adb").apply { mkdirs() }
    private val keyFile = File(dir, "key.pk8")
    private val certFile = File(dir, "cert.der")
    private val key: PrivateKey
    private val cert: Certificate

    init {
        api = Build.VERSION.SDK_INT
        setTimeout(8, TimeUnit.SECONDS)
        var k: PrivateKey? = null
        var c: Certificate? = null
        if (keyFile.exists() && certFile.exists()) runCatching {
            k = KeyFactory.getInstance("RSA").generatePrivate(PKCS8EncodedKeySpec(keyFile.readBytes()))
            c = CertificateFactory.getInstance("X.509").generateCertificate(certFile.inputStream())
        }
        if (k == null || c == null) {
            val kp = KeyPairGenerator.getInstance("RSA").apply { initialize(2048) }.generateKeyPair()
            val name = X500Name("CN=EliteTunerX")
            val now = System.currentTimeMillis()
            val builder = JcaX509v3CertificateBuilder(
                name, BigInteger.valueOf(now), Date(now - 86_400_000L), Date(now + 30L * 365 * 86_400_000L), name, kp.public
            )
            val signer = JcaContentSignerBuilder("SHA256withRSA").build(kp.private)
            val x509 = JcaX509CertificateConverter().getCertificate(builder.build(signer))
            keyFile.writeBytes(kp.private.encoded)
            certFile.writeBytes(x509.encoded)
            k = kp.private; c = x509
        }
        key = k!!; cert = c!!
    }

    override fun getPrivateKey(): PrivateKey = key
    override fun getCertificate(): Certificate = cert
    override fun getDeviceName(): String = "EliteTunerX"

    companion object {
        @Volatile private var inst: EtxAdb? = null
        fun get(ctx: Context): EtxAdb = inst ?: synchronized(this) {
            inst ?: EtxAdb(ctx.applicationContext).also { inst = it }
        }
        fun peek(): EtxAdb? = inst
    }
}

sealed class AdbState(val label: String) {
    object Off : AdbState("ยังไม่เชื่อม")
    object Connecting : AdbState("กำลังเชื่อม…")
    object Connected : AdbState("เชื่อมแล้ว")
    class Failed(val why: String) : AdbState("เชื่อมไม่สำเร็จ")
}

object AdbLink {
    val state = MutableStateFlow<AdbState>(AdbState.Off)
    val pairPort = MutableStateFlow<Int?>(null)

    val connected: Boolean get() = EtxAdb.peek()?.isConnected == true

    fun canToggleWirelessDebugging(ctx: Context): Boolean =
        ctx.checkSelfPermission(Manifest.permission.WRITE_SECURE_SETTINGS) == PackageManager.PERMISSION_GRANTED

    fun wirelessDebuggingOn(ctx: Context): Boolean =
        runCatching { Settings.Global.getInt(ctx.contentResolver, "adb_wifi_enabled", 0) == 1 }.getOrDefault(false)

    fun everPaired(ctx: Context): Boolean = ctx.getSharedPreferences("etx", 0).getBoolean("adb_paired", false)

    /** Blocking. Tries TLS (Android 11+ wireless debugging) and legacy `adb tcpip 5555`. */
    @Synchronized
    fun connect(ctx: Context, quiet: Boolean = false): Boolean {
        if (connected) { state.value = AdbState.Connected; return true }
        if (!quiet) state.value = AdbState.Connecting
        val adb = runCatching { EtxAdb.get(ctx) }.getOrElse {
            state.value = AdbState.Failed("สร้างกุญแจ ADB ไม่ได้: ${it.message}"); return false
        }
        var why = ""
        // After a reboot Wireless debugging is off; switch it back on if we were allowed to.
        if (Build.VERSION.SDK_INT >= 30 && !wirelessDebuggingOn(ctx) && canToggleWirelessDebugging(ctx)) {
            runCatching { Settings.Global.putInt(ctx.contentResolver, "adb_wifi_enabled", 1) }
            Thread.sleep(2500)
        }
        val ok = runCatching {
            if (Build.VERSION.SDK_INT >= 30) adb.connectTls(ctx, 6000) else false
        }.onFailure { why = it.message ?: it.toString() }.getOrDefault(false) ||
            runCatching { adb.connect("127.0.0.1", 5555) }.onFailure { if (why.isEmpty()) why = it.message ?: "" }.getOrDefault(false)
        if (ok) {
            state.value = AdbState.Connected
            ctx.getSharedPreferences("etx", 0).edit().putBoolean("adb_paired", true).apply()
            // Lets the app turn Wireless debugging back on after reboots (development permission, shell may grant it).
            if (!canToggleWirelessDebugging(ctx)) exec("pm grant ${ctx.packageName} android.permission.WRITE_SECURE_SETTINGS", 5000)
        } else {
            state.value = if (quiet) AdbState.Off else AdbState.Failed(
                when {
                    Build.VERSION.SDK_INT >= 30 && !wirelessDebuggingOn(ctx) -> "Wireless debugging ปิดอยู่ (ต้องต่อ Wi-Fi แล้วเปิดใน Developer options)"
                    !everPaired(ctx) -> "ยังไม่ได้จับคู่ — กด \"จับคู่ด้วยรหัส\" ก่อน"
                    else -> "หา adbd ไม่เจอ ($why)"
                }
            )
        }
        return ok
    }

    /** Finds the pairing port that appears while "Pair device with pairing code" is open. */
    fun discoverPairingPort(ctx: Context, timeoutMs: Long): Int? {
        val latch = CountDownLatch(1)
        var port: Int? = null
        val mdns = AdbMdns(ctx, AdbMdns.SERVICE_TYPE_TLS_PAIRING) { _: InetAddress?, p: Int ->
            if (p > 0) { port = p; pairPort.value = p; latch.countDown() }
        }
        mdns.start()
        latch.await(timeoutMs, TimeUnit.MILLISECONDS)
        runCatching { mdns.stop() }
        return port
    }

    /** Pairs with the 6-digit code, then connects. Blocking. */
    fun pair(ctx: Context, code: String, port: Int? = null): String {
        val p = port ?: pairPort.value ?: discoverPairingPort(ctx, 8000)
            ?: return "✖ ไม่เจอหน้าจับคู่ — เปิด Wireless debugging → \"จับคู่อุปกรณ์ด้วยรหัสจับคู่\" ค้างไว้"
        return try {
            val adb = EtxAdb.get(ctx)
            if (!adb.pair("127.0.0.1", p, code.trim())) return "✖ รหัสไม่ถูกต้องหรือหมดเวลา"
            ctx.getSharedPreferences("etx", 0).edit().putBoolean("adb_paired", true).apply()
            pairPort.value = null
            Thread.sleep(800)
            if (connect(ctx)) "✔ จับคู่และเชื่อมสำเร็จ" else "✔ จับคู่แล้ว แต่ยังเชื่อมไม่ได้: ${(state.value as? AdbState.Failed)?.why ?: ""}"
        } catch (t: Throwable) {
            "✖ จับคู่ไม่สำเร็จ: ${t.message ?: t}"
        }
    }

    fun disconnect() {
        runCatching { EtxAdb.peek()?.disconnect() }
        state.value = AdbState.Off
    }

    private const val EXIT_MARK = "@@ETX_EXIT="

    /** Runs a shell command line over ADB. Returns (exitCode, output). */
    fun exec(cmdLine: String, timeoutMs: Long): Pair<Int, String> {
        val adb = EtxAdb.peek() ?: return -1 to ""
        if (!adb.isConnected) return -1 to ""
        val stream: AdbStream = try {
            adb.openStream("shell:$cmdLine 2>&1; echo \"$EXIT_MARK\$?\"")
        } catch (t: Throwable) {
            if (adb.isConnected.not()) state.value = AdbState.Off
            return -1 to (t.message ?: "")
        }
        val buf = ByteArrayOutputStream()
        val reader = thread(isDaemon = true) {
            runCatching {
                val input = stream.openInputStream()
                val b = ByteArray(16384)
                while (true) {
                    val n = input.read(b)
                    if (n < 0) break
                    synchronized(buf) { buf.write(b, 0, n) }
                }
            }
        }
        reader.join(timeoutMs)
        if (reader.isAlive) runCatching { stream.close() }
        val text = synchronized(buf) { buf.toString(Charsets.UTF_8.name()) }
        val i = text.lastIndexOf(EXIT_MARK)
        if (i < 0) return -1 to text
        val code = text.substring(i + EXIT_MARK.length).trim().toIntOrNull() ?: -1
        return code to text.substring(0, i)
    }
}
