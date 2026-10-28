package com.gpslib.tracker

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.content.ServiceConnection
import android.hardware.Sensor
import android.hardware.SensorManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import java.util.Locale
import androidx.core.content.ContextCompat
import com.gpslib.tracker.capture.CaptureOptions
import com.gpslib.tracker.capture.RecordingOptions
import com.gpslib.tracker.service.LiveStats
import com.gpslib.tracker.service.LocationUpdate
import com.gpslib.tracker.service.NoSessionException
import com.gpslib.tracker.service.RecordingMeta
import com.gpslib.tracker.service.RecordingPhase
import com.gpslib.tracker.service.RecordingState
import com.gpslib.tracker.service.SessionActiveException
import com.gpslib.tracker.service.SessionStorage
import com.gpslib.tracker.service.TrackingService
import com.gpslib.tracker.service.TrackingSession
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.exception.toCodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The Expo module: the typed surface of the recorder.
 *
 * It owns no state. The service owns the session and publishes it through
 * [TrackingSession]; this class starts the service, forwards the calls and
 * relays the events. That is the whole point of the holder object: a JS
 * reload, a second subscriber or a destroyed React instance cannot lose a
 * recording, because none of them ever held it.
 *
 * The calls that act on a running session are promise-based: the module binds
 * to the service, runs the action and resolves the promise from the binding
 * callback. The legacy `TrackingService.instance` singleton is gone - the
 * binding is what replaced it.
 */
class GpsTrackerModule : Module() {
    private var tts: TextToSpeech? = null
    private var isTtsReady = false
    private var pendingSpeech: String? = null
    private val audioManager by lazy {
        appContext.reactContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
    }
    private var audioFocusRequest: AudioFocusRequest? = null

    private val stateListener = object : TrackingSession.Listener {
        override fun onStateChanged(state: RecordingState) {
            this@GpsTrackerModule.sendEvent(EVENT_STATE_CHANGE, state.toMap())
        }

        override fun onLocationUpdate(update: LocationUpdate) = Unit
    }

    private val locationListener = object : TrackingSession.Listener {
        override fun onStateChanged(state: RecordingState) = Unit

        override fun onLocationUpdate(update: LocationUpdate) {
            this@GpsTrackerModule.sendEvent(EVENT_LOCATION_UPDATE, update.toMap())
        }
    }

    override fun definition() = ModuleDefinition {
        Name("GpsTracker")

        Events(EVENT_STATE_CHANGE, EVENT_LOCATION_UPDATE)

        AsyncFunction("getCapabilities") {
            val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
            mapOf(
                "canRecord" to true,
                "hasBarometer" to hasBarometer(context),
                "canExemptBattery" to isIgnoringBatteryOptimizations(context),
                "canSpeak" to true,
                "canVibrate" to hasVibrator(context)
            )
        }

        AsyncFunction("requestIgnoreBatteryOptimization") { promise: Promise ->
            val context = appContext.reactContext ?: run {
                promise.reject(Exceptions.ReactContextLost())
                return@AsyncFunction
            }
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
                promise.resolve(true)
                return@AsyncFunction
            }
            val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
            if (powerManager != null && powerManager.isIgnoringBatteryOptimizations(context.packageName)) {
                promise.resolve(true)
                return@AsyncFunction
            }
            try {
                val intent = Intent().apply {
                    action = Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
                    data = Uri.parse("package:${context.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
                promise.resolve(true)
            } catch (_: Exception) {
                try {
                    val fallback = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(fallback)
                    promise.resolve(true)
                } catch (error: Exception) {
                    promise.reject(error.toCodedException())
                }
            }
        }

        AsyncFunction("speak") { text: String, promise: Promise ->
            val context = appContext.reactContext
            if (context == null) {
                promise.reject(Exceptions.ReactContextLost())
                return@AsyncFunction
            }
            ensureTts(context)
            if (isTtsReady && tts != null) {
                doSpeak(text)
                promise.resolve()
            } else {
                pendingSpeech = text
                promise.resolve()
            }
        }

        AsyncFunction("vibrate") { promise: Promise ->
            val context = appContext.reactContext
            if (context == null) {
                promise.reject(Exceptions.ReactContextLost())
                return@AsyncFunction
            }
            doVibrate(context)
            promise.resolve()
        }

        AsyncFunction("startRecording") { options: RecordingOptionsRecord, promise: Promise ->
            val capture = CaptureOptions(
                intervalMs = options.capture.intervalMs.toLong(),
                minDistanceMeters = options.capture.minDistanceM.toFloat(),
                accuracyCeilingMeters = options.capture.accuracyCeilingM.toFloat(),
                useBarometer = options.capture.useBarometer
            )
            withService(promise) { service ->
                promise.resolve(
                    service.startRecording(RecordingOptions(options.profile, capture)).toMap()
                )
            }
        }

        AsyncFunction("pauseRecording") { promise: Promise ->
            withService(promise) { service ->
                service.pauseRecording()
                promise.resolve()
            }
        }

        AsyncFunction("resumeRecording") { promise: Promise ->
            withService(promise) { service ->
                service.resumeRecording()
                promise.resolve()
            }
        }

        AsyncFunction("stopRecording") { promise: Promise ->
            withService(promise) { service ->
                val summary = service.stopRecording()
                promise.resolve(
                    mapOf(
                        "meta" to summary.meta.toMap(),
                        "liveStats" to summary.liveStats.toMap()
                    )
                )
            }
        }

        AsyncFunction("getRecordingState") {
            TrackingSession.currentState().toMap()
        }

        AsyncFunction("getSessionMeta") { sessionId: String? ->
            val storage = storage()
            val meta = if (sessionId != null) {
                storage.readMeta(sessionId)
            } else {
                storage.listMetas().firstOrNull()
            } ?: throw NoSessionException()
            meta.toMap()
        }

        AsyncFunction("listSessions") {
            storage().listMetas().map { meta -> meta.toMap() }
        }

        AsyncFunction("markSessionSaved") { sessionId: String, activityId: String ->
            storage().markSaved(sessionId, activityId)
            if (TrackingSession.meta?.sessionId == sessionId) {
                TrackingSession.clear()
            }
            null
        }

        AsyncFunction("discardSession") { sessionId: String ->
            val phase = TrackingSession.phase
            if (phase == RecordingPhase.RECORDING || phase == RecordingPhase.PAUSED) {
                throw SessionActiveException(TrackingSession.meta?.sessionId)
            }
            storage().discard(sessionId)
            if (TrackingSession.meta?.sessionId == sessionId) {
                TrackingSession.clear()
            }
            null
        }

        AsyncFunction("getStorageSize") {
            storage().totalSizeBytes()
        }

        AsyncFunction("deleteAllSessions") { promise: Promise ->
            val phase = TrackingSession.phase
            if (phase == RecordingPhase.RECORDING || phase == RecordingPhase.PAUSED) {
                promise.reject(SessionActiveException(TrackingSession.meta?.sessionId))
                return@AsyncFunction
            }
            withService(promise) { service ->
                service.deleteAllSessions()
                promise.resolve()
            }
        }

        OnStartObserving(EVENT_STATE_CHANGE) {
            TrackingSession.addListener(stateListener)
        }

        OnStopObserving(EVENT_STATE_CHANGE) {
            TrackingSession.removeListener(stateListener)
        }

        OnStartObserving(EVENT_LOCATION_UPDATE) {
            TrackingSession.addListener(locationListener)
        }

        OnStopObserving(EVENT_LOCATION_UPDATE) {
            TrackingSession.removeListener(locationListener)
        }

        OnDestroy {
            TrackingSession.removeListener(stateListener)
            TrackingSession.removeListener(locationListener)
            runCatching {
                tts?.stop()
                tts?.shutdown()
            }
            tts = null
            isTtsReady = false
            pendingSpeech = null
            releaseAudioFocus()
        }
    }

    /**
     * Starts the service if needed, binds to it, runs the action and resolves
     * the promise.
     *
     * The binding is released right after the action: the service is a started
     * service, so it keeps recording with nobody bound to it - which is the
     * point (the service must outlive the JS module).
     */
    private fun withService(promise: Promise, action: (TrackingService) -> Unit) {
        val context = appContext.reactContext
        if (context == null) {
            promise.reject(Exceptions.ReactContextLost())
            return
        }

        val intent = Intent(context, TrackingService::class.java)
        val connection = object : ServiceConnection {
            override fun onServiceConnected(name: ComponentName?, binder: IBinder?) {
                val localBinder = binder as? TrackingService.LocalBinder
                runCatching { context.unbindService(this) }
                if (localBinder == null) {
                    promise.reject(
                        "E_SERVICE_UNAVAILABLE",
                        "The recording service could not be reached.",
                        null
                    )
                    return
                }
                try {
                    action(localBinder.getService())
                } catch (error: Throwable) {
                    promise.reject(error.toCodedException())
                }
            }

            override fun onServiceDisconnected(name: ComponentName?) = Unit
        }

        try {
            ContextCompat.startForegroundService(context, intent)
            context.bindService(intent, connection, Context.BIND_AUTO_CREATE)
        } catch (error: Throwable) {
            promise.reject(error.toCodedException())
        }
    }

    private fun ensureTts(context: Context) {
        if (tts != null) return
        try {
            tts = TextToSpeech(context.applicationContext) { status ->
                if (status == TextToSpeech.SUCCESS) {
                    val engine = tts
                    val targetLocale = Locale.getDefault()
                    val result = engine?.setLanguage(targetLocale)
                    if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                        engine?.language = Locale.US
                    }
                    engine?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                        override fun onStart(utteranceId: String?) {}
                        override fun onDone(utteranceId: String?) { releaseAudioFocus() }
                        override fun onError(utteranceId: String?) { releaseAudioFocus() }
                    })
                    isTtsReady = true
                    pendingSpeech?.let { text ->
                        doSpeak(text)
                        pendingSpeech = null
                    }
                } else {
                    isTtsReady = false
                }
            }
        } catch (_: Exception) {
            isTtsReady = false
        }
    }

    private fun doSpeak(text: String) {
        val engine = tts ?: return
        if (!isTtsReady) return
        requestAudioFocus()
        try {
            val params = android.os.Bundle().apply {
                putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_NOTIFICATION)
            }
            engine.speak(text, TextToSpeech.QUEUE_ADD, params, "offline_fitness_split")
        } catch (_: Exception) {
            releaseAudioFocus()
        }
    }

    private fun doVibrate(context: Context) {
        val vibrator: Vibrator? = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
            val vm = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
            vm?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
        vibrator?.let { vib ->
            if (!vib.hasVibrator()) return@let
            try {
                val pattern = longArrayOf(0, 150, 100, 150)
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                    vib.vibrate(android.os.VibrationEffect.createWaveform(pattern, -1))
                } else {
                    @Suppress("DEPRECATION")
                    vib.vibrate(pattern, -1)
                }
            } catch (_: Exception) {}
        }
    }

    private fun requestAudioFocus() {
        val am = audioManager ?: return
        try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                val attrs = AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
                val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                    .setAudioAttributes(attrs)
                    .setAcceptsDelayedFocusGain(false)
                    .setOnAudioFocusChangeListener { }
                    .build()
                audioFocusRequest = req
                am.requestAudioFocus(req)
            } else {
                @Suppress("DEPRECATION")
                am.requestAudioFocus(null, AudioManager.STREAM_NOTIFICATION, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
            }
        } catch (_: Exception) {}
    }

    private fun releaseAudioFocus() {
        val am = audioManager ?: return
        try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                audioFocusRequest?.let { am.abandonAudioFocusRequest(it); audioFocusRequest = null }
            } else {
                @Suppress("DEPRECATION")
                am.abandonAudioFocus(null)
            }
        } catch (_: Exception) {}
    }

    private fun hasVibrator(context: Context): Boolean {
        val vib = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
            (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
        return vib?.hasVibrator() ?: false
    }

    private fun storage(): SessionStorage {
        val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
        return SessionStorage(context)
    }

    private fun hasBarometer(context: Context): Boolean {
        val sensors = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager ?: return false
        return sensors.getDefaultSensor(Sensor.TYPE_PRESSURE) != null
    }

    private fun isIgnoringBatteryOptimizations(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return false
        }
        val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return false
        return powerManager.isIgnoringBatteryOptimizations(context.packageName)
    }

    private companion object {
        const val EVENT_STATE_CHANGE = "onStateChange"
        const val EVENT_LOCATION_UPDATE = "onLocationUpdate"
    }
}

private fun RecordingMeta.toMap(): Map<String, Any?> = mapOf(
    "sessionId" to sessionId,
    "profile" to profile,
    "startedAtUtcMs" to startedAtUtcMs,
    "endedAtUtcMs" to endedAtUtcMs,
    "deviceUtcOffsetSeconds" to deviceUtcOffsetSeconds,
    "capture" to mapOf(
        "intervalMs" to capture.intervalMs,
        "minDistanceM" to capture.minDistanceMeters.toDouble(),
        "accuracyCeilingM" to capture.accuracyCeilingMeters.toDouble(),
        "useBarometer" to capture.useBarometer
    ),
    "pauses" to pauses.map { pause ->
        mapOf("startUtcMs" to pause.startUtcMs, "endUtcMs" to pause.endUtcMs)
    },
    "fixCount" to fixCount,
    "logUri" to logUri,
    "libraryVersion" to libraryVersion,
    "savedActivityId" to savedActivityId
)

private fun RecordingState.toMap(): Map<String, Any?> = mapOf(
    "phase" to phase.toWireValue(),
    "sessionId" to sessionId,
    "startedAtUtcMs" to startedAtUtcMs
)

private fun LiveStats.toMap(): Map<String, Any?> = mapOf(
    "elapsedSec" to elapsedSec,
    "movingTimeSec" to movingTimeSec,
    "distanceMeters" to distanceMeters,
    "currentSpeedMps" to currentSpeedMps?.toDouble(),
    "altitudeM" to altitudeM,
    "gpsLost" to gpsLost,
    "hAccM" to hAccM?.toDouble()
)

private fun LocationUpdate.toMap(): Map<String, Any?> = mapOf(
    "t" to t,
    "lat" to lat,
    "lon" to lon,
    "eleM" to eleM,
    "pressureHpa" to pressureHpa,
    "speedMps" to speedMps?.toDouble(),
    "elapsedSec" to elapsedSec,
    "movingTimeSec" to movingTimeSec,
    "distanceMeters" to distanceMeters,
    "gpsLost" to gpsLost,
    "hAccM" to hAccM?.toDouble()
)
