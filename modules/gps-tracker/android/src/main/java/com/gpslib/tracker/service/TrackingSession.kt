package com.gpslib.tracker.service

import java.util.concurrent.CopyOnWriteArraySet

/**
 * The holder the service publishes through and the module reads from.
 *
 * This is the piece that replaces the legacy `TrackingService.listener`
 * static. The difference matters: the static was a single mutable slot that
 * the last listener overwrote, and the service had to know about JS. Here the
 * *service* owns the session, this object is where that ownership is
 * published, and the module is only a subscriber - so a JS reload, a second
 * subscriber or a destroyed React instance cannot lose a recording.
 */
object TrackingSession {

    interface Listener {
        fun onStateChanged(state: RecordingState)
        fun onLocationUpdate(update: LocationUpdate)
    }

    private val listeners = CopyOnWriteArraySet<Listener>()

    @Volatile
    var phase: RecordingPhase = RecordingPhase.IDLE
        private set

    @Volatile
    var meta: RecordingMeta? = null
        private set

    @Volatile
    var liveStats: LiveStats = LiveStats()
        private set

    fun addListener(listener: Listener) {
        listeners.add(listener)
    }

    fun removeListener(listener: Listener) {
        listeners.remove(listener)
    }

    fun currentState(): RecordingState = RecordingState(
        phase = phase,
        sessionId = meta?.sessionId,
        startedAtUtcMs = meta?.startedAtUtcMs
    )

    internal fun begin(meta: RecordingMeta) {
        this.meta = meta
        this.liveStats = LiveStats()
        setPhase(RecordingPhase.RECORDING)
    }

    internal fun setPhase(phase: RecordingPhase) {
        this.phase = phase
        notifyStateChanged()
    }

    internal fun updateLiveStats(stats: LiveStats) {
        this.liveStats = stats
    }

    internal fun clear() {
        this.phase = RecordingPhase.IDLE
        this.meta = null
        this.liveStats = LiveStats()
        notifyStateChanged()
    }

    internal fun notifyLocationUpdate(update: LocationUpdate) {
        listeners.forEach { listener -> listener.onLocationUpdate(update) }
    }

    private fun notifyStateChanged() {
        val state = currentState()
        listeners.forEach { listener -> listener.onStateChanged(state) }
    }
}
