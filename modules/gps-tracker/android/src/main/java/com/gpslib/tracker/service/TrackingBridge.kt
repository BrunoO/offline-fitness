package com.gpslib.tracker.service

import java.util.concurrent.CopyOnWriteArraySet

/**
 * Phase 0 seam between the foreground service and the Expo module.
 *
 * The service owns the session; the module only ever subscribes. That ownership
 * is the point of the design (docs/recording-plan.md §4): the React instance can
 * be destroyed mid-recording, so no canonical state may live in the module.
 *
 * Phase 1 replaces this with the real session holder and its state machine; the
 * direction of the dependency (service → bridge ← module) stays the same.
 */
object TrackingBridge {
  fun interface Listener {
    fun onTick(count: Int, elapsedMs: Long)
  }

  private val listeners = CopyOnWriteArraySet<Listener>()

  @Volatile
  var tickCount: Int = 0
    private set

  fun addListener(listener: Listener) {
    listeners.add(listener)
  }

  fun removeListener(listener: Listener) {
    listeners.remove(listener)
  }

  fun dispatchTick(count: Int, elapsedMs: Long) {
    tickCount = count
    listeners.forEach { listener -> listener.onTick(count, elapsedMs) }
  }
}
