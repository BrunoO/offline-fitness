package com.gpslib.tracker

import android.content.Context
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorManager
import android.os.Build
import android.os.PowerManager
import androidx.core.content.ContextCompat
import com.gpslib.tracker.service.TrackingBridge
import com.gpslib.tracker.service.TrackingService
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Phase 0 skeleton of the recording module (docs/recording-plan.md §6).
 *
 * The module is a thin facade: it starts and stops the service and forwards the
 * service's ticks. It deliberately holds no session state — the service owns it,
 * so a destroyed React instance cannot lose a recording (§4).
 */
class GpsTrackerModule : Module() {
  private val tickListener = TrackingBridge.Listener { count, elapsedMs ->
    sendEvent(EVENT_TICK, mapOf("count" to count, "elapsedMs" to elapsedMs))
  }

  override fun definition() = ModuleDefinition {
    Name("GpsTracker")

    Events(EVENT_TICK)

    AsyncFunction("getCapabilities") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      mapOf(
        "canRecord" to true,
        "hasBarometer" to hasBarometer(context),
        "canExemptBattery" to isIgnoringBatteryOptimizations(context)
      )
    }

    AsyncFunction("start") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      ContextCompat.startForegroundService(context, Intent(context, TrackingService::class.java))
      true
    }

    AsyncFunction("stop") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      context.stopService(Intent(context, TrackingService::class.java))
      true
    }

    // Phase 0 probe only: lets the debug screen read the last tick without an
    // event subscription. Removed when the real session API lands.
    AsyncFunction("getTickCount") { TrackingBridge.tickCount }

    OnStartObserving(EVENT_TICK) {
      TrackingBridge.addListener(tickListener)
    }

    OnStopObserving(EVENT_TICK) {
      TrackingBridge.removeListener(tickListener)
    }

    OnDestroy {
      TrackingBridge.removeListener(tickListener)
    }
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
    const val EVENT_TICK = "onTick"
  }
}
