package com.gpslib.tracker.provider

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.os.Looper
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.gpslib.tracker.capture.CaptureOptions

/**
 * The Google fused provider, ported from the legacy library.
 *
 * The only change is the argument: the profile is gone, the capture options
 * that the profile used to carry arrive from TypeScript instead. The legacy
 * profile also had a separate "fastest interval"; the contract has one
 * interval, so the request interval is used for both.
 */
class FusedLocationProvider(private val context: Context) : ILocationProvider {

    private val fusedClient: FusedLocationProviderClient =
        LocationServices.getFusedLocationProviderClient(context)

    private var locationCallback: LocationCallback? = null

    @SuppressLint("MissingPermission")
    override fun start(options: CaptureOptions, onLocation: (Location) -> Unit) {
        stop()

        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, options.intervalMs)
            .setMinUpdateIntervalMillis(options.intervalMs)
            .setMinUpdateDistanceMeters(options.minDistanceMeters)
            .setWaitForAccurateLocation(true)
            .build()

        locationCallback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                for (location in result.locations) {
                    onLocation(location)
                }
            }
        }

        fusedClient.requestLocationUpdates(request, locationCallback!!, Looper.getMainLooper())
    }

    override fun stop() {
        locationCallback?.let {
            fusedClient.removeLocationUpdates(it)
            locationCallback = null
        }
    }
}
