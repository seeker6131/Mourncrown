package com.elitetunerx

import com.elitetunerx.core.FpsMeter
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

class TimeStatsParseTest {
    private val sample = """
statsStart = 1700000000
statsEnd = 1700000001
totalFrames = 300
missedFrames = 0
present2present histogram is as below:
16ms=300
layerName = com.android.systemui/StatusBar#12
packageName = com.android.systemui
totalFrames = 2
present2present histogram is as below:
16ms=2
layerName = SurfaceView[com.game.demo/com.game.demo.MainActivity]#88(BLAST Consumer)88
uid = 10234
packageName = com.game.demo
totalSampledFrames = 58
totalFrames = 58
droppedFrames = 0
present2present histogram is as below:
16ms=40 17ms=12 33ms=6
post2present histogram is as below:
5ms=58
""".trimIndent()

    @Test fun picksGameLayer() {
        val r = FpsMeter.parseTimeStats(sample, "com.game.demo", 1.0)
        assertNotNull(r)
        assertEquals(58.0, r!!.displayFps!!, 0.01)
        assertEquals(58, r.frameTimesMs.size)
        assert(r.layer!!.startsWith("SurfaceView[com.game.demo"))
    }
}
