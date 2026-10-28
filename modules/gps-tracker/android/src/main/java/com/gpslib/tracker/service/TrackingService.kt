package com.gpslib.tracker.service

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationManager
import android.location.OnNmeaMessageListener
import android.os.Binder
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.gpslib.tracker.altitude.AltitudeProcessor
import com.gpslib.tracker.capture.CaptureOptions
import com.gpslib.tracker.capture.RecordingOptions
import com.gpslib.tracker.provider.AndroidLocationProvider
import com.gpslib.tracker.provider.FusedLocationProvider
import com.gpslib.tracker.provider.ILocationProvider
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.atomic.AtomicInteger

/**
 * The recording service, ported from the legacy library.
 *
 * What survived the port: the foreground service, the wake lock, the
 * notification, the location providers and the session bookkeeping. What did
 * not: the GPX writer, the live filter pipeline, the altitude fusion and the
 * split feedback - all of that is now the TypeScript replay's job (D2), and
 * the service only records what the platform reported.
 *
 * The service owns the session. The Expo module drives it through the binder
 * and reads the published state from [TrackingSession]; nothing about a
 * recording lives in the module, so a JS reload cannot lose one.
 */
class TrackingService : Service() {

    inner class LocalBinder : Binder() {
        fun getService(): TrackingService = this@TrackingService
    }

    private val binder = LocalBinder()

    private var wakeLock: PowerManager.WakeLock? = null
    private var provider: ILocationProvider? = null
    private var altitudeProcessor: AltitudeProcessor? = null
    private var nmeaListener: OnNmeaMessageListener? = null
    private var writer: FixLogWriter? = null

    private var lastLocation: Location? = null
    private var distanceMeters = 0.0
    private var movingTimeSec = 0L
    private var fixCount = 0
    private var lastMetaWriteMs = 0L
    private var lastNotificationMs = 0L
    private var lastFixTimeMs = 0L
    private var gpsLost = false

    private val gpsCheckHandler = Handler(Looper.getMainLooper())
    private val gpsCheckRunnable = object : Runnable {
        override fun run() {
            checkGpsStatus()
            gpsCheckHandler.postDelayed(this, GPS_CHECK_INTERVAL_MS)
        }
    }

    private val storage by lazy { SessionStorage(this) }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onBind(intent: Intent?): IBinder = binder

    /**
     * The module starts the service with `startForegroundService`, so the
     * notification has to be up within a few seconds - even before a session
     * exists. `START_STICKY` keeps the service alive across a process kill.
     */
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Notification action buttons (pause/resume/stop from the shade) arrive
        // here as service intents. Handle them before the foreground-start path
        // so they act on the running session instead of (re)starting the
        // foreground notification.
        when (intent?.action) {
            ACTION_PAUSE -> {
                pauseRecording()
                return START_STICKY
            }
            ACTION_RESUME -> {
                resumeRecording()
                return START_STICKY
            }
            ACTION_STOP -> {
                stopRecording()
                return START_NOT_STICKY
            }
        }
        val phase = TrackingSession.phase
        if (phase == RecordingPhase.RECORDING || phase == RecordingPhase.PAUSED) {
            startForegroundNotification(notificationTitle(), notificationContent())
        } else {
            startForegroundNotification("Recording", "Waiting to record")
        }
        return START_STICKY
    }

    fun startRecording(options: RecordingOptions): RecordingMeta {
        val phase = TrackingSession.phase
        if (phase == RecordingPhase.RECORDING || phase == RecordingPhase.PAUSED) {
            throw SessionActiveException(TrackingSession.meta?.sessionId)
        }
        if (!isLocationAvailable()) {
            throw LocationUnavailableException()
        }

        val startedAtMs = System.currentTimeMillis()
        val sessionId = "s-$startedAtMs-${sessionCounter.incrementAndGet()}"

        storage.createSession(sessionId)
        val meta = RecordingMeta(
            sessionId = sessionId,
            profile = options.profile,
            startedAtUtcMs = startedAtMs,
            endedAtUtcMs = null,
            deviceUtcOffsetSeconds = TimeZone.getDefault().getOffset(startedAtMs) / 1000,
            capture = options.capture,
            pauses = mutableListOf(),
            fixCount = 0,
            logUri = storage.logUri(sessionId),
            libraryVersion = SessionStorage.LIBRARY_VERSION
        )
        storage.writeMeta(meta)
        storage.setActiveSession(sessionId)

        writer = FixLogWriter(storage.fixesFile(sessionId)).also { it.open() }
        lastLocation = null
        distanceMeters = 0.0
        movingTimeSec = 0L
        fixCount = 0
        lastMetaWriteMs = startedAtMs
        lastNotificationMs = startedAtMs
        lastFixTimeMs = startedAtMs
        gpsLost = false
        gpsCheckHandler.removeCallbacks(gpsCheckRunnable)
        gpsCheckHandler.postDelayed(gpsCheckRunnable, GPS_CHECK_INTERVAL_MS)

        TrackingSession.begin(meta)
        acquireWakeLock()
        startAltitude(options.capture)
        startProvider(options.capture)
        updateNotification()

        return meta
    }

    fun pauseRecording() {
        if (TrackingSession.phase != RecordingPhase.RECORDING) {
            return
        }
        val meta = TrackingSession.meta ?: return

        meta.pauses.add(PauseInterval(startUtcMs = System.currentTimeMillis()))
        lastLocation = null
        stopProvider()
        stopAltitude()
        releaseWakeLock()
        gpsCheckHandler.removeCallbacks(gpsCheckRunnable)
        writer?.flush()
        storage.writeMeta(meta)

        TrackingSession.setPhase(RecordingPhase.PAUSED)
        updateNotification()
    }

    fun resumeRecording() {
        if (TrackingSession.phase != RecordingPhase.PAUSED) {
            return
        }
        val meta = TrackingSession.meta ?: return

        meta.pauses.lastOrNull()?.let { pause ->
            if (pause.endUtcMs == null) {
                pause.endUtcMs = System.currentTimeMillis()
            }
        }

        TrackingSession.setPhase(RecordingPhase.RECORDING)
        acquireWakeLock()
        startAltitude(meta.capture)
        startProvider(meta.capture)
        gpsCheckHandler.removeCallbacks(gpsCheckRunnable)
        gpsCheckHandler.postDelayed(gpsCheckRunnable, GPS_CHECK_INTERVAL_MS)
        storage.writeMeta(meta)
        updateNotification()
    }

    fun stopRecording(): RecordingSummary {
        val meta = TrackingSession.meta
        val now = System.currentTimeMillis()

        stopProvider()
        stopAltitude()
        releaseWakeLock()
        gpsCheckHandler.removeCallbacks(gpsCheckRunnable)
        writer?.close()
        writer = null

        if (meta != null) {
            meta.pauses.lastOrNull()?.let { pause ->
                if (pause.endUtcMs == null) {
                    pause.endUtcMs = now
                }
            }
            meta.endedAtUtcMs = now
            meta.fixCount = fixCount
            storage.writeMeta(meta)
            storage.clearActiveSession()
        }

        TrackingSession.setPhase(RecordingPhase.STOPPED_UNSAVED)
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()

        return RecordingSummary(meta ?: returnEmptyMeta(), TrackingSession.liveStats)
    }

    private fun returnEmptyMeta() = RecordingMeta(
        sessionId = "",
        profile = "",
        startedAtUtcMs = 0L,
        endedAtUtcMs = null,
        deviceUtcOffsetSeconds = 0,
        capture = CaptureOptions(1000L, 0f, 50f, false),
        pauses = mutableListOf(),
        fixCount = 0,
        logUri = "",
        libraryVersion = SessionStorage.LIBRARY_VERSION
    )

    private fun handleLocation(location: Location) {
        if (TrackingSession.phase != RecordingPhase.RECORDING) {
            return
        }
        val meta = TrackingSession.meta ?: return

        val now = System.currentTimeMillis()
        lastFixTimeMs = now
        if (gpsLost) {
            gpsLost = false
            updateNotification()
        }
        val fixTime = if (location.time > 0) location.time else now
        val sample = altitudeProcessor?.sample(location)

        val accuracy = if (location.hasAccuracy()) location.accuracy else null
        val accepted = accuracy == null || accuracy <= meta.capture.accuracyCeilingMeters
        val reason = if (accepted) {
            null
        } else {
            "accuracy ${accuracy!!.toInt()} m over ${meta.capture.accuracyCeilingMeters.toInt()} m"
        }

        writer?.append(
            FixLogEntry(
                t = fixTime,
                lat = location.latitude,
                lon = location.longitude,
                ele = sample?.rawAltitudeMeters,
                geoid = sample?.geoidHeightMeters,
                pressure = sample?.pressureHpa,
                hAcc = accuracy ?: 0f,
                vAcc = sample?.verticalAccuracyMeters,
                speed = if (location.hasSpeed()) location.speed else null,
                bearing = if (location.hasBearing()) location.bearing else null,
                source = sourceOf(location),
                accepted = accepted,
                reason = reason
            )
        )

        fixCount += 1
        meta.fixCount = fixCount

        val threshold = profileStationaryThreshold()
        val rawSpeed = if (location.hasSpeed()) location.speed else null
        val currentSpeed = if (rawSpeed != null && rawSpeed < threshold) 0f else rawSpeed

        if (accepted) {
            val previous = lastLocation
            if (previous == null) {
                lastLocation = location
            } else {
                val stepMeters = previous.distanceTo(location)
                if (stepMeters >= meta.capture.minDistanceMeters && !isStationaryDrift(location, stepMeters, previous)) {
                    distanceMeters += stepMeters
                    lastLocation = location
                    val dt = (location.time - previous.time).coerceAtLeast(0L) / 1000L
                    if (dt in 1L..5L && currentSpeed != null && currentSpeed > 0f) {
                        movingTimeSec += dt
                    }
                }
            }
        }

        val liveStats = LiveStats(
            elapsedSec = elapsedSeconds(meta, now),
            movingTimeSec = movingTimeSec,
            distanceMeters = distanceMeters,
            currentSpeedMps = currentSpeed,
            altitudeM = sample?.mslAltitudeMeters ?: sample?.rawAltitudeMeters,
            gpsLost = gpsLost,
            hAccM = if (location.hasAccuracy()) location.accuracy else null
        )
        TrackingSession.updateLiveStats(liveStats)
        TrackingSession.notifyLocationUpdate(
            LocationUpdate(
                t = fixTime,
                lat = location.latitude,
                lon = location.longitude,
                eleM = sample?.mslAltitudeMeters ?: sample?.rawAltitudeMeters,
                pressureHpa = sample?.pressureHpa,
                speedMps = liveStats.currentSpeedMps,
                elapsedSec = liveStats.elapsedSec,
                movingTimeSec = movingTimeSec,
                distanceMeters = liveStats.distanceMeters,
                gpsLost = gpsLost,
                hAccM = liveStats.hAccM
            )
        )

        if (now - lastMetaWriteMs >= META_WRITE_INTERVAL_MS) {
            storage.writeMeta(meta)
            lastMetaWriteMs = now
        }
        if (now - lastNotificationMs >= NOTIFICATION_INTERVAL_MS) {
            updateNotification()
            lastNotificationMs = now
        }
    }

    private fun profileStationaryThreshold(): Float =
        when (TrackingSession.meta?.profile?.lowercase(Locale.US)) {
            "cycling" -> 0.8f
            "hiking" -> 0.3f
            "running" -> 0.5f
            else -> 0.4f
        }

    /**
     * Mirrors replaySession.isStationaryDrift so stationary GPS wander while sitting on a desk
     * or standing still does not accumulate fake distance into live display counters.
     */
    private fun isStationaryDrift(location: Location, stepMeters: Float, previous: Location?): Boolean {
        val threshold = profileStationaryThreshold()
        val speed = if (location.hasSpeed()) {
            location.speed
        } else if (previous != null) {
            val dt = (location.time - previous.time).coerceAtLeast(0L) / 1000f
            if (dt > 0.1f) stepMeters / dt else 0f
        } else {
            0f
        }
        return speed < threshold
    }

    /** Wall clock minus the manual pauses. Display only; the replay owns the truth. */
    private fun elapsedSeconds(meta: RecordingMeta, now: Long): Long {
        var pausedMs = 0L
        meta.pauses.forEach { pause ->
            val end = pause.endUtcMs ?: now
            pausedMs += (end - pause.startUtcMs).coerceAtLeast(0L)
        }
        return ((now - meta.startedAtUtcMs) - pausedMs).coerceAtLeast(0L) / 1000L
    }

    private fun sourceOf(location: Location): String = when (location.provider?.lowercase(Locale.US)) {
        "gps" -> "gps"
        "fused" -> "fused"
        "network" -> "network"
        else -> "unknown"
    }

    private fun isLocationAvailable(): Boolean {
        val manager = getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return false
        val gpsEnabled = runCatching { manager.isProviderEnabled(LocationManager.GPS_PROVIDER) }.getOrDefault(false)
        val networkEnabled = runCatching { manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) }.getOrDefault(false)
        return gpsEnabled || networkEnabled
    }

    private fun startProvider(capture: CaptureOptions) {
        stopProvider()
        val selected: ILocationProvider = runCatching { FusedLocationProvider(this) }.getOrNull()
            ?: AndroidLocationProvider(this)
        provider = selected
        try {
            selected.start(capture) { location -> handleLocation(location) }
        } catch (error: SecurityException) {
            provider = null
            throw LocationUnavailableException()
        }
    }

    private fun stopProvider() {
        provider?.stop()
        provider = null
    }

    private fun startAltitude(capture: CaptureOptions) {
        stopAltitude()
        altitudeProcessor = AltitudeProcessor(this, capture.useBarometer).also { it.start() }
        registerNmeaListener()
    }

    private fun stopAltitude() {
        altitudeProcessor?.stop()
        altitudeProcessor = null
        val listener = nmeaListener
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && listener != null) {
            val manager = getSystemService(Context.LOCATION_SERVICE) as? LocationManager
            runCatching { manager?.removeNmeaListener(listener) }
            nmeaListener = null
        }
    }

    private fun registerNmeaListener() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
            return
        }
        val manager = getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return
        val listener = OnNmeaMessageListener { message, _ ->
            altitudeProcessor?.onNmeaSentence(message)
        }
        nmeaListener = listener
        runCatching { manager.addNmeaListener(listener, null) }
    }

    @SuppressLint("WakelockTimeout")
    private fun acquireWakeLock() {
        if (wakeLock == null) {
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "GpsTracker:RecordingWakeLock")
        }
        wakeLock?.let { lock ->
            if (!lock.isHeld) {
                lock.acquire()
            }
        }
    }

    private fun releaseWakeLock() {
        wakeLock?.let { lock ->
            if (lock.isHeld) {
                lock.release()
            }
        }
    }

    private fun notificationTitle(): String {
        val profile = TrackingSession.meta?.profile ?: return "Recording"
        return "Recording ${profile.replaceFirstChar { it.uppercase() }}"
    }

    private fun notificationContent(): String {
        val stats = TrackingSession.liveStats
        val distanceKm = stats.distanceMeters / 1000.0
        val durationSec = stats.elapsedSec
        val hours = durationSec / 3600
        val minutes = (durationSec % 3600) / 60
        val seconds = durationSec % 60
        val time = if (hours > 0) {
            String.format(Locale.US, "%d:%02d:%02d", hours, minutes, seconds)
        } else {
            String.format(Locale.US, "%02d:%02d", minutes, seconds)
        }
        if (gpsLost) {
            return "Waiting for GPS"
        }
        val prefix = if (TrackingSession.phase == RecordingPhase.PAUSED) "Paused • " else ""
        return String.format(Locale.US, "%s%.2f km • %s", prefix, distanceKm, time)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Recording",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Shows the ongoing GPS recording"
            setShowBadge(false)
        }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private fun buildNotification(title: String, content: String): Notification {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(content)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(Notification.CATEGORY_WORKOUT)

        // Action buttons reflect the current session phase. The phase is the
        // single source of truth (TrackingSession), so the shade stays in sync
        // with the in-app UI through updateNotification().
        val phase = TrackingSession.phase
        if (phase == RecordingPhase.RECORDING) {
            val pauseIntent = Intent(this, TrackingService::class.java).apply { action = ACTION_PAUSE }
            val pausePending = PendingIntent.getService(
                this,
                REQUEST_CODE_PAUSE,
                pauseIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            builder.addAction(android.R.drawable.ic_media_pause, "Pause", pausePending)
        } else if (phase == RecordingPhase.PAUSED) {
            val resumeIntent = Intent(this, TrackingService::class.java).apply { action = ACTION_RESUME }
            val resumePending = PendingIntent.getService(
                this,
                REQUEST_CODE_RESUME,
                resumeIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            builder.addAction(android.R.drawable.ic_media_play, "Resume", resumePending)
        }

        if (phase == RecordingPhase.RECORDING || phase == RecordingPhase.PAUSED) {
            val stopIntent = Intent(this, TrackingService::class.java).apply { action = ACTION_STOP }
            val stopPending = PendingIntent.getService(
                this,
                REQUEST_CODE_STOP,
                stopIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            builder.addAction(android.R.drawable.ic_delete, "Stop", stopPending)
        }

        return builder.build()
    }

    private fun startForegroundNotification(title: String, content: String) {
        val notification = buildNotification(title, content)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun updateNotification() {
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(NOTIFICATION_ID, buildNotification(notificationTitle(), notificationContent()))
    }

    fun storageSizeBytes(): Long = storage.totalSizeBytes()

    fun deleteAllSessions() {
        storage.deleteAll()
        TrackingSession.clear()
    }

    override fun onDestroy() {
        gpsCheckHandler.removeCallbacks(gpsCheckRunnable)
        releaseWakeLock()
        stopProvider()
        stopAltitude()
        writer?.close()
        writer = null
        super.onDestroy()
    }

    private fun checkGpsStatus() {
        if (TrackingSession.phase != RecordingPhase.RECORDING) {
            return
        }
        val now = System.currentTimeMillis()
        if (now - lastFixTimeMs > GPS_LOST_THRESHOLD_MS && !gpsLost) {
            gpsLost = true
            updateNotification()
            TrackingSession.updateLiveStats(TrackingSession.liveStats.copy(gpsLost = true))
            val last = lastLocation
            if (last != null) {
                TrackingSession.notifyLocationUpdate(
                    LocationUpdate(
                        t = last.time,
                        lat = last.latitude,
                        lon = last.longitude,
                        eleM = null,
                        speedMps = null,
                        elapsedSec = TrackingSession.liveStats.elapsedSec,
                        movingTimeSec = TrackingSession.liveStats.movingTimeSec,
                        distanceMeters = TrackingSession.liveStats.distanceMeters,
                        gpsLost = true,
                        hAccM = null
                    )
                )
            }
        }
    }

    companion object {
        const val CHANNEL_ID = "gps-recording"
        const val NOTIFICATION_ID = 4201

        // Intent actions delivered to onStartCommand by the notification's
        // action buttons. Kept as fully-qualified strings so they cannot
        // collide with any other component's actions.
        const val ACTION_PAUSE = "com.gpslib.tracker.action.PAUSE"
        const val ACTION_RESUME = "com.gpslib.tracker.action.RESUME"
        const val ACTION_STOP = "com.gpslib.tracker.action.STOP"

        // Distinct request codes so PendingIntent.getService does not reuse
        // the same pending intent for different actions.
        private const val REQUEST_CODE_PAUSE = 101
        private const val REQUEST_CODE_RESUME = 102
        private const val REQUEST_CODE_STOP = 103

        private const val META_WRITE_INTERVAL_MS = 5000L
        private const val NOTIFICATION_INTERVAL_MS = 5000L
        private const val GPS_CHECK_INTERVAL_MS = 5000L
        private const val GPS_LOST_THRESHOLD_MS = 10_000L

        private val sessionCounter = AtomicInteger(0)
    }
}
