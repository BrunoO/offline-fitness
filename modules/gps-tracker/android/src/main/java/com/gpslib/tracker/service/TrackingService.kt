package com.gpslib.tracker.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

/**
 * Phase 0 stub of the recording service (docs/recording-plan.md §6).
 *
 * It proves the three things the phase exists for: a location-typed foreground
 * service starts from the module, it keeps running while the app is backgrounded,
 * and it can push events to JS through the bridge. It captures nothing yet — the
 * providers and the fix log arrive in Phases 1–2, which replace the ticker below.
 */
class TrackingService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private var startedAtElapsedMs = 0L
  private var tickCount = 0

  private val ticker = object : Runnable {
    override fun run() {
      tickCount += 1
      TrackingBridge.dispatchTick(tickCount, SystemClock.elapsedRealtime() - startedAtElapsedMs)
      handler.postDelayed(this, TICK_INTERVAL_MS)
    }
  }

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
    startForeground(NOTIFICATION_ID, buildNotification())
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (startedAtElapsedMs == 0L) {
      startedAtElapsedMs = SystemClock.elapsedRealtime()
    }
    handler.removeCallbacks(ticker)
    handler.post(ticker)
    return START_STICKY
  }

  override fun onDestroy() {
    handler.removeCallbacks(ticker)
    // The foreground notification is the only visible sign that recording is
    // on: it must disappear with the service, not linger in the shade.
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }
    val manager = getSystemService(NotificationManager::class.java)
    val channel = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW)
    channel.setShowBadge(false)
    manager.createNotificationChannel(channel)
  }

  private fun buildNotification(): Notification =
    NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(CHANNEL_NAME)
      .setContentText("Phase 0 stub — recording service is connected.")
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setOngoing(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()

  private companion object {
    const val CHANNEL_ID = "gps-recording"
    const val CHANNEL_NAME = "Recording"
    const val NOTIFICATION_ID = 4201
    const val TICK_INTERVAL_MS = 1_000L
  }
}
