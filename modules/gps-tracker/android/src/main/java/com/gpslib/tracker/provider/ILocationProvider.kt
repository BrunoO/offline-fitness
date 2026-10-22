package com.gpslib.tracker.provider

import android.location.Location
import com.gpslib.tracker.capture.CaptureOptions

interface ILocationProvider {
    fun start(options: CaptureOptions, onLocation: (Location) -> Unit)
    fun stop()
}
