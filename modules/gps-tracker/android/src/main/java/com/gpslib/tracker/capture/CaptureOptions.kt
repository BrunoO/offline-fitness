package com.gpslib.tracker.capture

/**
 * Capture parameters, sent from TypeScript with the profile.
 *
 * The Kotlin side no longer knows about activity profiles: they became
 * `profiles.ts` in the app (the numbers moved, the behaviour did not). What
 * reaches the service is the four values the capture loop needs.
 */
data class CaptureOptions(
    val intervalMs: Long,
    val minDistanceMeters: Float,
    val accuracyCeilingMeters: Float,
    val useBarometer: Boolean
)

/** A recording request: which profile the user picked, and how to capture. */
data class RecordingOptions(
    val profile: String,
    val capture: CaptureOptions
)
