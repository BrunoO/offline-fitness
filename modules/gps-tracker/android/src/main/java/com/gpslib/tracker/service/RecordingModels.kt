package com.gpslib.tracker.service

import com.gpslib.tracker.capture.CaptureOptions

/**
 * The native half of the recording contract.
 *
 * These types are the same shape as the TypeScript ones in
 * `modules/gps-tracker/src/GpsTracker.types.ts`: the module converts them to
 * maps and the app never learns a Kotlin class.
 */

enum class RecordingPhase {
    IDLE,
    RECORDING,
    PAUSED,
    STOPPED_UNSAVED;

    /** The wire value: `idle`, `recording`, `paused`, `stopped-unsaved`. */
    fun toWireValue(): String = name.lowercase().replace('_', '-')
}

data class PauseInterval(
    val startUtcMs: Long,
    var endUtcMs: Long? = null
)

data class RecordingMeta(
    val sessionId: String,
    val profile: String,
    val startedAtUtcMs: Long,
    var endedAtUtcMs: Long? = null,
    val deviceUtcOffsetSeconds: Int,
    val capture: CaptureOptions,
    val pauses: MutableList<PauseInterval> = mutableListOf(),
    var fixCount: Int = 0,
    val logUri: String,
    val libraryVersion: String,
    var savedActivityId: String? = null
)

data class RecordingState(
    val phase: RecordingPhase,
    val sessionId: String?,
    val startedAtUtcMs: Long?
)

/**
 * Live numbers, for the screen only. The canonical ones are produced by the
 * TypeScript replay over the fix log, never by these counters.
 */
data class LiveStats(
    val elapsedSec: Long = 0L,
    val movingTimeSec: Long = 0L,
    val distanceMeters: Double = 0.0,
    val currentSpeedMps: Float? = null,
    val altitudeM: Double? = null,
    val gpsLost: Boolean = false,
    val hAccM: Float? = null
)

data class RecordingSummary(
    val meta: RecordingMeta,
    val liveStats: LiveStats
)

/**
 * A display-only location event. May be dropped under load.
 *
 * It carries the live counters next to the fix, so the screen can show
 * elapsed, distance, speed and altitude from one event instead of polling
 * the service. None of it is canonical - the replay owns that.
 */
data class LocationUpdate(
    val t: Long,
    val lat: Double,
    val lon: Double,
    val eleM: Double?,
    val pressureHpa: Double? = null,
    val speedMps: Float?,
    val elapsedSec: Long,
    val movingTimeSec: Long = 0L,
    val distanceMeters: Double,
    val gpsLost: Boolean = false,
    val hAccM: Float? = null
)
