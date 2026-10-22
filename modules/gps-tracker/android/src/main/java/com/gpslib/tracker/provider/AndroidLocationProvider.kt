package com.gpslib.tracker.provider

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Looper
import com.gpslib.tracker.capture.CaptureOptions

/**
 * The platform `LocationManager` provider, ported from the legacy library.
 *
 * Used when the fused provider is unavailable; the profile argument became the
 * capture options, as in [FusedLocationProvider].
 */
class AndroidLocationProvider(private val context: Context) : ILocationProvider {

    private val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    private var locationListener: LocationListener? = null

    @SuppressLint("MissingPermission")
    override fun start(options: CaptureOptions, onLocation: (Location) -> Unit) {
        stop()

        locationListener = object : LocationListener {
            override fun onLocationChanged(location: Location) {
                onLocation(location)
            }

            @Deprecated("Deprecated in Java")
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
            override fun onProviderEnabled(provider: String) {}
            override fun onProviderDisabled(provider: String) {}
        }

        val provider = if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
            LocationManager.GPS_PROVIDER
        } else {
            LocationManager.NETWORK_PROVIDER
        }

        locationManager.requestLocationUpdates(
            provider,
            options.intervalMs,
            options.minDistanceMeters,
            locationListener!!,
            Looper.getMainLooper()
        )
    }

    override fun stop() {
        locationListener?.let {
            locationManager.removeUpdates(it)
            locationListener = null
        }
    }
}
