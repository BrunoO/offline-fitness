package com.gpslib.tracker.altitude

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import android.os.Build

/**
 * What the platform knows about altitude right now.
 *
 * The legacy processor fused GPS altitude with the barometer and accumulated
 * gain and loss. That arithmetic moved to the TypeScript replay (D2): the
 * replay has to re-derive every number from the log, so the capture side only
 * reports what it measured.
 */
data class AltitudeSample(
    val rawAltitudeMeters: Double?,
    val mslAltitudeMeters: Double?,
    val geoidHeightMeters: Double?,
    val pressureHpa: Double?,
    val verticalAccuracyMeters: Float?
)

/**
 * The reduced altitude processor: barometer pressure and the NMEA geoid
 * separation, plus the platform's own vertical accuracy.
 *
 * Ported from the legacy library with the fusion, the smoothing and the
 * gain/loss accumulation removed - the replay owns those now.
 */
class AltitudeProcessor(
    context: Context,
    private val useBarometer: Boolean
) : SensorEventListener {

    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
    private val pressureSensor = if (useBarometer) {
        sensorManager?.getDefaultSensor(Sensor.TYPE_PRESSURE)
    } else {
        null
    }

    @Volatile
    private var pressureHpa: Double? = null

    @Volatile
    private var geoidHeightMeters: Double? = null

    fun start() {
        pressureSensor?.let { sensorManager?.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL) }
    }

    fun stop() {
        pressureSensor?.let { sensorManager?.unregisterListener(this) }
    }

    /**
     * Reads the geoid separation out of an NMEA GGA sentence (field 11), the
     * same way the legacy processor did.
     */
    fun onNmeaSentence(sentence: String) {
        if (!sentence.contains("GGA")) {
            return
        }
        val parts = sentence.split(",")
        if (parts.size > 11 && parts[11].isNotBlank()) {
            val parsed = parts[11].toDoubleOrNull()
            if (parsed != null) {
                geoidHeightMeters = parsed
            }
        }
    }

    fun sample(location: Location): AltitudeSample {
        val raw = if (location.hasAltitude()) location.altitude else null

        val msl = when {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE && location.hasMslAltitude() ->
                location.mslAltitudeMeters
            raw != null && geoidHeightMeters != null -> raw - geoidHeightMeters!!
            else -> null
        }

        if (geoidHeightMeters == null && raw != null && msl != null) {
            geoidHeightMeters = raw - msl
        }

        val verticalAccuracy = when {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE && location.hasMslAltitudeAccuracy() ->
                location.mslAltitudeAccuracyMeters
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && location.hasVerticalAccuracy() ->
                location.verticalAccuracyMeters
            location.hasAccuracy() -> location.accuracy * 1.5f
            else -> null
        }

        return AltitudeSample(
            rawAltitudeMeters = raw,
            mslAltitudeMeters = msl,
            geoidHeightMeters = geoidHeightMeters,
            pressureHpa = pressureHpa,
            verticalAccuracyMeters = verticalAccuracy
        )
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event?.sensor?.type == Sensor.TYPE_PRESSURE) {
            pressureHpa = event.values[0].toDouble()
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
}
