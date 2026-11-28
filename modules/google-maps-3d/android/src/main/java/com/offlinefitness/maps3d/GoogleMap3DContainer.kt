package com.offlinefitness.maps3d

import android.content.Context
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.ReactContext
import com.google.android.gms.maps3d.GoogleMap3D
import com.google.android.gms.maps3d.Map3DView
import com.google.android.gms.maps3d.OnMap3DViewReadyCallback
import com.google.android.gms.maps3d.model.AltitudeMode
import com.google.android.gms.maps3d.model.Camera
import com.google.android.gms.maps3d.model.FlyToOptions
import com.google.android.gms.maps3d.model.LatLngAltitude
import com.google.android.gms.maps3d.model.Map3DMode
import com.google.android.gms.maps3d.model.Polyline
import com.google.android.gms.maps3d.model.PolylineOptions
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.lang.ref.WeakReference
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToLong
import kotlin.math.sin
import kotlin.math.sqrt

data class TrackPoint(
  val latitude: Double,
  val longitude: Double,
  val altitude: Double
)

class GoogleMap3DContainer(
  context: Context,
  appContext: AppContext
) : ExpoView(context, appContext), OnMap3DViewReadyCallback, LifecycleEventListener {

  override val shouldUseAndroidLayout: Boolean = true

  private val onMapReady by EventDispatcher()
  private val onMapError by EventDispatcher()
  private val onFlyoverProgress by EventDispatcher()
  private val onFlyoverSegmentStart by EventDispatcher()
  private val onFlyoverComplete by EventDispatcher()

  private val mainHandler = Handler(Looper.getMainLooper())
  private val reactContext: ReactContext? =
    (appContext.reactContext as? ReactContext) ?: (context as? ReactContext)

  private var map3DView: Map3DView? = null
  private var googleMap3D: GoogleMap3D? = null
  private var activePolyline: Polyline? = null

  private var isLifecycleRegistered = false
  private var isStarted = false
  private var isResumed = false
  private var isDestroyed = false

  // Track & polyline state
  private var pendingCoordinates: List<TrackPoint>? = null
  private var currentTrack: List<TrackPoint> = emptyList()
  private var fullTrackLatLng: List<LatLngAltitude> = emptyList()
  private var keyframes: List<TrackPoint> = emptyList()
  private var keyframeSourceIndices: IntArray = IntArray(0)
  private var keyframeDistances: DoubleArray = DoubleArray(0)
  private var totalKeyframeDistance: Double = 0.0
  private var strokeColorInt: Int = DEFAULT_STROKE_COLOR
  private var strokeWidthPx: Double = DEFAULT_STROKE_WIDTH
  private var currentMapMode: Int = Map3DMode.HYBRID

  // Flyover animation state
  private var desiredPlaying: Boolean = false
  private var isAnimating: Boolean = false
  private var isCompleted: Boolean = false
  private var currentKeyframeIndex: Int = 0
  private var pendingSeekProgress: Double? = null
  private var animationGeneration: Int = 0
  private var speedMultiplier: Double = DEFAULT_SPEED_MULTIPLIER
  private var baseSpeedMps: Double = BASE_FLYOVER_SPEED_MPS
  private var cameraTilt: Double = DEFAULT_CAMERA_TILT
  private var cameraRange: Double = DEFAULT_CAMERA_RANGE

  init {
    // Enforce Google Maps 3D single-instance rule before creating a new Map3DView.
    releaseExistingActiveInstance(except = this)
    activeInstance = WeakReference(this)

    val view = Map3DView(context, Map3DMode.HYBRID)
    view.layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
    addView(view)
    map3DView = view

    try {
      view.onCreate(null)
      view.getMap3DViewAsync(this)
    } catch (e: Exception) {
      Log.e(TAG, "Failed to initialize Map3DView", e)
      emitMapError(e.message ?: "Failed to initialize Map3DView")
    }

    reactContext?.let { rc ->
      rc.addLifecycleEventListener(this)
      isLifecycleRegistered = true
      if (rc.hasCurrentActivity()) {
        // Host Activity is already resumed when mounting dynamically.
        startAndResumeMap()
      }
    }
  }

  // ---------------------------------------------------------------------------
  // LifecycleEventListener (strict Map3DView lifecycle relay)
  // ---------------------------------------------------------------------------

  override fun onHostResume() {
    if (isDestroyed) return
    mainHandler.post {
      if (isDestroyed) return@post
      startAndResumeMap()
      if (desiredPlaying && !isAnimating && !isCompleted && keyframes.size >= 2 && googleMap3D != null) {
        resumeFlyoverFromCurrentIndex()
      }
    }
  }

  override fun onHostPause() {
    if (isDestroyed) return
    mainHandler.post {
      if (isDestroyed) return@post
      pauseAnimationInternal()
      pauseAndStopMap()
    }
  }

  override fun onHostDestroy() {
    mainHandler.post {
      destroyMapInstance()
    }
  }

  private fun startAndResumeMap() {
    val view = map3DView ?: return
    if (isDestroyed) return
    try {
      if (!isStarted) {
        view.onStart()
        isStarted = true
      }
      if (!isResumed) {
        view.onResume()
        isResumed = true
      }
    } catch (e: Exception) {
      Log.w(TAG, "Map3DView start/resume warning", e)
    }
  }

  private fun pauseAndStopMap() {
    val view = map3DView ?: return
    try {
      if (isResumed) {
        view.onPause()
        isResumed = false
      }
      if (isStarted) {
        view.onStop()
        isStarted = false
      }
    } catch (e: Exception) {
      Log.w(TAG, "Map3DView pause/stop warning", e)
    }
  }

  fun destroyMapInstance() {
    if (isDestroyed) return
    isDestroyed = true
    animationGeneration++
    isAnimating = false

    if (isLifecycleRegistered) {
      reactContext?.removeLifecycleEventListener(this)
      isLifecycleRegistered = false
    }

    try {
      googleMap3D?.setCameraAnimationEndListener(null)
      googleMap3D?.stopCameraAnimation()
    } catch (e: Exception) {
      Log.w(TAG, "Error stopping camera animation during destroy", e)
    }

    try {
      activePolyline?.remove()
    } catch (e: Exception) {
      Log.w(TAG, "Error removing polyline during destroy", e)
    }
    activePolyline = null
    googleMap3D = null

    val view = map3DView
    map3DView = null
    if (view != null) {
      try {
        if (isResumed) {
          view.onPause()
          isResumed = false
        }
        if (isStarted) {
          view.onStop()
          isStarted = false
        }
        view.onDestroy()
      } catch (e: Exception) {
        Log.w(TAG, "Error destroying Map3DView", e)
      }
      removeView(view)
    }

    if (activeInstance?.get() === this) {
      activeInstance = null
    }
  }

  // ---------------------------------------------------------------------------
  // OnMap3DViewReadyCallback
  // ---------------------------------------------------------------------------

  override fun onMap3DViewReady(googleMap3D: GoogleMap3D) {
    mainHandler.post {
      if (isDestroyed) return@post
      this.googleMap3D = googleMap3D
      googleMap3D.setMapMode(currentMapMode)

      googleMap3D.setCameraAnimationEndListener {
        val gen = animationGeneration
        mainHandler.post {
          onSegmentAnimationEnded(gen)
        }
      }

      onMapReady(emptyMap())

      val pending = pendingCoordinates
      if (pending != null) {
        pendingCoordinates = null
        applyTrackToMap(pending)
      } else if (currentTrack.isNotEmpty()) {
        applyTrackToMap(currentTrack)
      }
    }
  }

  override fun onError(error: Exception) {
    Log.e(TAG, "Map3DView initialization error", error)
    emitMapError(error.message ?: "Map3DView initialization error")
  }

  private fun emitMapError(message: String) {
    mainHandler.post {
      if (isDestroyed) return@post
      onMapError(mapOf("message" to message))
    }
  }

  // ---------------------------------------------------------------------------
  // Props & Commands
  // ---------------------------------------------------------------------------

  fun setCoordinates(rawCoordinates: List<Map<String, Any?>>) {
    val parsed = parseTrackPoints(rawCoordinates)
    if (parsed == currentTrack && pendingCoordinates == null) {
      return
    }
    currentTrack = parsed
    if (googleMap3D == null) {
      pendingCoordinates = parsed
      return
    }
    applyTrackToMap(parsed)
  }

  fun setStrokeColor(colorHex: String?) {
    val parsed = parseColorOrDefault(colorHex, DEFAULT_STROKE_COLOR)
    if (parsed == strokeColorInt) return
    strokeColorInt = parsed
    activePolyline?.setStrokeColor(parsed)
  }

  fun setStrokeWidth(width: Double?) {
    val nextWidth = (width ?: DEFAULT_STROKE_WIDTH).coerceIn(1.0, 64.0)
    if (nextWidth == strokeWidthPx) return
    strokeWidthPx = nextWidth
    activePolyline?.setStrokeWidth(nextWidth)
  }

  fun setIsPlaying(playing: Boolean) {
    desiredPlaying = playing
    if (googleMap3D == null || keyframes.size < 2) {
      return
    }
    if (playing) {
      if (isCompleted) {
        currentKeyframeIndex = 0
        isCompleted = false
        updateTraveledPolyline(0)
        positionCameraAtStart()
        emitProgress(0.0)
      }
      if (!isAnimating) {
        resumeFlyoverFromCurrentIndex()
      }
    } else {
      pauseAnimationInternal()
    }
  }

  fun setSpeedMultiplier(multiplier: Double?) {
    val next = (multiplier ?: DEFAULT_SPEED_MULTIPLIER).coerceIn(MIN_SPEED_MULTIPLIER, MAX_SPEED_MULTIPLIER)
    speedMultiplier = next
  }

  fun setBaseSpeedMps(speedMps: Double?) {
    val next = (speedMps ?: BASE_FLYOVER_SPEED_MPS).coerceIn(MIN_BASE_SPEED_MPS, MAX_BASE_SPEED_MPS)
    baseSpeedMps = next
  }

  fun setCameraTilt(tilt: Double?) {
    val next = (tilt ?: DEFAULT_CAMERA_TILT).coerceIn(MIN_TILT_DEGREES, MAX_TILT_DEGREES)
    if (next == cameraTilt) return
    cameraTilt = next
    if (!isAnimating && googleMap3D != null && keyframes.isNotEmpty()) {
      snapCameraToKeyframe(currentKeyframeIndex)
    }
  }

  fun setCameraRange(range: Double?) {
    val next = (range ?: DEFAULT_CAMERA_RANGE).coerceIn(MIN_RANGE_METERS, MAX_RANGE_METERS)
    if (next == cameraRange) return
    cameraRange = next
    if (!isAnimating && googleMap3D != null && keyframes.isNotEmpty()) {
      snapCameraToKeyframe(currentKeyframeIndex)
    }
  }

  fun setMapMode(mode: String?) {
    val next = when (mode?.uppercase()) {
      "SATELLITE" -> Map3DMode.SATELLITE
      else -> Map3DMode.HYBRID
    }
    if (next == currentMapMode) return
    currentMapMode = next
    googleMap3D?.setMapMode(next)
  }

  fun restartFlyover() {
    mainHandler.post {
      if (isDestroyed || googleMap3D == null || keyframes.isEmpty()) return@post
      pauseAnimationInternal()
      pendingSeekProgress = null
      currentKeyframeIndex = 0
      isCompleted = false
      updateTraveledPolyline(0)
      positionCameraAtStart()
      emitProgress(0.0)
      if (desiredPlaying && keyframes.size >= 2) {
        resumeFlyoverFromCurrentIndex()
      }
    }
  }

  fun seekTo(progressPercent: Double) {
    val clamped = progressPercent.coerceIn(0.0, 100.0)
    mainHandler.post {
      if (isDestroyed) return@post
      if (googleMap3D == null || keyframes.isEmpty()) {
        pendingSeekProgress = clamped
        return@post
      }
      pauseAnimationInternal()
      pendingSeekProgress = null
      currentKeyframeIndex = keyframeIndexForProgress(clamped)
      isCompleted = currentKeyframeIndex >= keyframes.lastIndex
      updateTraveledPolyline(currentKeyframeIndex)
      snapCameraToKeyframe(currentKeyframeIndex)
      emitProgress(progressForKeyframeIndex(currentKeyframeIndex))
      if (desiredPlaying && !isCompleted && keyframes.size >= 2) {
        resumeFlyoverFromCurrentIndex()
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 3D Polyline Rendering
  // ---------------------------------------------------------------------------

  private fun applyTrackToMap(points: List<TrackPoint>) {
    if (googleMap3D == null) return
    pauseAnimationInternal()
    activePolyline?.remove()
    activePolyline = null

    if (points.size < 2) {
      fullTrackLatLng = emptyList()
      keyframes = emptyList()
      keyframeSourceIndices = IntArray(0)
      keyframeDistances = DoubleArray(0)
      totalKeyframeDistance = 0.0
      currentKeyframeIndex = 0
      isCompleted = false
      return
    }

    fullTrackLatLng = points.map { LatLngAltitude(it.latitude, it.longitude, it.altitude) }
    val (builtKeyframes, sourceIndices) = buildFlyoverKeyframes(points)
    keyframes = builtKeyframes
    keyframeSourceIndices = sourceIndices
    keyframeDistances = computeKeyframeDistances(keyframes)
    totalKeyframeDistance = keyframeDistances.lastOrNull() ?: 0.0

    val initialSeek = pendingSeekProgress
    pendingSeekProgress = null
    currentKeyframeIndex = if (initialSeek != null) keyframeIndexForProgress(initialSeek) else 0
    isCompleted = currentKeyframeIndex >= keyframes.lastIndex

    updateTraveledPolyline(currentKeyframeIndex)
    emitProgress(progressForKeyframeIndex(currentKeyframeIndex))

    if (desiredPlaying && !isCompleted && keyframes.size >= 2) {
      snapCameraToKeyframe(currentKeyframeIndex)
      resumeFlyoverFromCurrentIndex()
    } else {
      flyCameraToInitialKeyframe(currentKeyframeIndex)
    }
  }

  private fun updateTraveledPolyline(keyframeIndex: Int) {
    val map = googleMap3D ?: return
    if (fullTrackLatLng.size < 2 || keyframeSourceIndices.isEmpty()) {
      activePolyline?.remove()
      activePolyline = null
      return
    }
    val clampedKf = keyframeIndex.coerceIn(0, keyframeSourceIndices.lastIndex)
    val endSourceIndex = keyframeSourceIndices[clampedKf].coerceIn(0, fullTrackLatLng.lastIndex)
    if (endSourceIndex < 1) {
      activePolyline?.remove()
      activePolyline = null
      return
    }

    val traveledPath = ArrayList(fullTrackLatLng.subList(0, endSourceIndex + 1))
    val existing = activePolyline
    if (existing != null) {
      existing.setPath(traveledPath)
    } else {
      val options = PolylineOptions().apply {
        setPath(traveledPath)
        setAltitudeMode(AltitudeMode.CLAMP_TO_GROUND)
        setStrokeColor(strokeColorInt)
        setStrokeWidth(strokeWidthPx)
        setOuterColor(Color.WHITE)
        setOuterWidth(DEFAULT_OUTER_WIDTH_RATIO)
        setDrawsOccludedSegments(true)
      }
      activePolyline = map.addPolyline(options)
    }
  }

  // ---------------------------------------------------------------------------
  // Flyover Camera Animation Engine
  // ---------------------------------------------------------------------------

  private fun positionCameraAtStart() {
    if (keyframes.isEmpty()) return
    snapCameraToKeyframe(0)
  }

  private fun snapCameraToKeyframe(index: Int) {
    val map = googleMap3D ?: return
    if (keyframes.isEmpty()) return
    val clampedIndex = index.coerceIn(0, keyframes.lastIndex)
    val point = keyframes[clampedIndex]
    val heading = computeLookAheadBearing(keyframes, clampedIndex)
    map.setCamera(buildCamera(point, heading))
  }

  private fun flyCameraToInitialKeyframe(index: Int) {
    val map = googleMap3D ?: return
    if (keyframes.isEmpty()) return
    val clampedIndex = index.coerceIn(0, keyframes.lastIndex)
    val point = keyframes[clampedIndex]
    val heading = computeLookAheadBearing(keyframes, clampedIndex)
    map.flyCameraTo(FlyToOptions(buildCamera(point, heading), INITIAL_FLY_TO_DURATION_MS))
  }

  private fun resumeFlyoverFromCurrentIndex() {
    if (isDestroyed || googleMap3D == null || keyframes.size < 2) return
    if (currentKeyframeIndex >= keyframes.lastIndex) {
      isCompleted = true
      isAnimating = false
      emitProgress(100.0)
      onFlyoverComplete(emptyMap())
      return
    }
    isAnimating = true
    animationGeneration++
    flyToNextKeyframe(animationGeneration)
  }

  private fun pauseAnimationInternal() {
    animationGeneration++
    if (isAnimating) {
      isAnimating = false
      try {
        googleMap3D?.stopCameraAnimation()
      } catch (e: Exception) {
        Log.w(TAG, "Error stopping camera animation", e)
      }
    }
  }

  private fun flyToNextKeyframe(expectedGeneration: Int) {
    if (isDestroyed || !isAnimating || expectedGeneration != animationGeneration) return
    val map = googleMap3D ?: return

    val nextIndex = currentKeyframeIndex + 1
    if (nextIndex >= keyframes.size) {
      isAnimating = false
      isCompleted = true
      emitProgress(100.0)
      onFlyoverComplete(emptyMap())
      return
    }

    val fromPoint = keyframes[currentKeyframeIndex]
    val toPoint = keyframes[nextIndex]
    val segmentDistanceMeters = haversineMeters(fromPoint, toPoint)
    val targetHeading = computeLookAheadBearing(keyframes, nextIndex)
    val durationMs = computeSegmentDurationMillis(segmentDistanceMeters, speedMultiplier)

    val endCamera = buildCamera(toPoint, targetHeading)
    val options = FlyToOptions(endCamera, durationMs)
    onFlyoverSegmentStart(
      mapOf(
        "fromProgress" to progressForKeyframeIndex(currentKeyframeIndex),
        "toProgress" to progressForKeyframeIndex(nextIndex),
        "durationMs" to durationMs
      )
    )
    map.flyCameraTo(options)
  }

  private fun onSegmentAnimationEnded(expectedGeneration: Int) {
    if (isDestroyed || !isAnimating || expectedGeneration != animationGeneration) {
      return
    }

    currentKeyframeIndex = min(currentKeyframeIndex + 1, keyframes.lastIndex)
    updateTraveledPolyline(currentKeyframeIndex)
    emitProgress(progressForKeyframeIndex(currentKeyframeIndex))

    if (currentKeyframeIndex >= keyframes.lastIndex) {
      isAnimating = false
      isCompleted = true
      onFlyoverComplete(emptyMap())
      return
    }

    if (desiredPlaying) {
      flyToNextKeyframe(expectedGeneration)
    } else {
      isAnimating = false
    }
  }

  private fun computeKeyframeDistances(points: List<TrackPoint>): DoubleArray {
    val distances = DoubleArray(points.size)
    for (i in 1 until points.size) {
      distances[i] = distances[i - 1] + haversineMeters(points[i - 1], points[i])
    }
    return distances
  }

  private fun progressForKeyframeIndex(index: Int): Double {
    if (keyframes.size <= 1) return 100.0
    val clamped = index.coerceIn(0, keyframes.lastIndex)
    if (totalKeyframeDistance > 0.0 && clamped < keyframeDistances.size) {
      return ((keyframeDistances[clamped] / totalKeyframeDistance) * 100.0).coerceIn(0.0, 100.0)
    }
    return (clamped.toDouble() / (keyframes.size - 1).toDouble()) * 100.0
  }

  private fun keyframeIndexForProgress(progressPercent: Double): Int {
    if (keyframes.size <= 1) return 0
    val clamped = progressPercent.coerceIn(0.0, 100.0)
    if (totalKeyframeDistance <= 0.0 || keyframeDistances.size != keyframes.size) {
      return ((clamped / 100.0) * keyframes.lastIndex).toInt().coerceIn(0, keyframes.lastIndex)
    }
    val targetDistance = (clamped / 100.0) * totalKeyframeDistance
    var bestIndex = 0
    var bestDiff = kotlin.math.abs(keyframeDistances[0] - targetDistance)
    for (i in 1 until keyframeDistances.size) {
      val diff = kotlin.math.abs(keyframeDistances[i] - targetDistance)
      if (diff < bestDiff) {
        bestDiff = diff
        bestIndex = i
      }
    }
    return bestIndex
  }

  private fun buildCamera(point: TrackPoint, headingDegrees: Double): Camera {
    return Camera(
      LatLngAltitude(point.latitude, point.longitude, CAMERA_GROUND_OFFSET_METERS),
      normalizeBearing(headingDegrees),
      cameraTilt,
      0.0,
      cameraRange,
      AltitudeMode.RELATIVE_TO_GROUND
    )
  }

  private fun emitProgress(progressPercent: Double) {
    val clamped = progressPercent.coerceIn(0.0, 100.0)
    onFlyoverProgress(mapOf("progress" to clamped))
  }

  // ---------------------------------------------------------------------------
  // Sub-sampling, Smoothing & Bearing Math
  // ---------------------------------------------------------------------------

  private fun buildFlyoverKeyframes(points: List<TrackPoint>): Pair<List<TrackPoint>, IntArray> {
    if (points.size <= 2) {
      return points to IntArray(points.size) { it }
    }

    val sampled = mutableListOf(points.first())
    val sampledIndices = mutableListOf(0)
    var lastKept = points.first()
    var lastHeading = computeBearing(points[0], points[1])

    for (i in 1 until points.lastIndex) {
      val candidate = points[i]
      val distFromLast = haversineMeters(lastKept, candidate)
      val nextHeading = computeBearing(candidate, points[i + 1])
      val headingDelta = shortestAngularDelta(lastHeading, nextHeading)

      val shouldKeep = distFromLast >= MIN_KEYFRAME_DISTANCE_METERS ||
        (distFromLast >= MIN_TURN_DISTANCE_METERS && headingDelta >= MIN_HEADING_CHANGE_DEGREES)

      if (shouldKeep) {
        sampled.add(candidate)
        sampledIndices.add(i)
        lastKept = candidate
        lastHeading = nextHeading
      }
    }

    val lastPoint = points.last()
    if (haversineMeters(sampled.last(), lastPoint) > 1.0) {
      sampled.add(lastPoint)
      sampledIndices.add(points.lastIndex)
    } else if (sampled.size == 1) {
      sampled.add(lastPoint)
      sampledIndices.add(points.lastIndex)
    } else {
      sampledIndices[sampledIndices.lastIndex] = points.lastIndex
    }

    if (sampled.size <= MAX_KEYFRAMES) {
      return sampled to sampledIndices.toIntArray()
    }

    // Uniformly thin if the route is very long to keep segment chaining responsive.
    val step = (sampled.size - 1).toDouble() / (MAX_KEYFRAMES - 1).toDouble()
    val thinned = mutableListOf<TrackPoint>()
    val thinnedIndices = IntArray(MAX_KEYFRAMES)
    for (k in 0 until MAX_KEYFRAMES - 1) {
      val idx = (k * step).toInt()
      thinned.add(sampled[idx])
      thinnedIndices[k] = sampledIndices[idx]
    }
    thinned.add(sampled.last())
    thinnedIndices[MAX_KEYFRAMES - 1] = sampledIndices.last()
    return thinned to thinnedIndices
  }

  private fun computeLookAheadBearing(points: List<TrackPoint>, index: Int): Double {
    if (points.size < 2) return 0.0
    val clamped = index.coerceIn(0, points.lastIndex)
    val origin = points[clamped]

    // Look ahead by k keyframes (at least LOOK_AHEAD_STEPS ahead) for natural framing.
    val targetIndex = min(clamped + LOOK_AHEAD_STEPS, points.lastIndex)
    if (targetIndex > clamped) {
      return computeBearing(origin, points[targetIndex])
    }
    // At the final point, preserve approach bearing from the preceding keyframe.
    val prevIndex = max(0, clamped - 1)
    return computeBearing(points[prevIndex], origin)
  }

  private fun computeSegmentDurationMillis(distanceMeters: Double, speed: Double): Long {
    val safeSpeed = speed.coerceIn(MIN_SPEED_MULTIPLIER, MAX_SPEED_MULTIPLIER)
    val rawMs = (distanceMeters / baseSpeedMps) * 1000.0
    val scaledMs = rawMs / safeSpeed
    val minMs = (MIN_SEGMENT_DURATION_MS / safeSpeed).coerceAtLeast(250.0)
    val maxMs = (MAX_SEGMENT_DURATION_MS / safeSpeed).coerceAtLeast(500.0)
    return scaledMs.coerceIn(minMs, maxMs).roundToLong()
  }

  companion object {
    private const val TAG = "GoogleMap3DContainer"
    private const val EARTH_RADIUS_METERS = 6_371_000.0

    private val DEFAULT_STROKE_COLOR: Int = Color.parseColor("#FC4C02")
    private const val DEFAULT_STROKE_WIDTH = 12.0
    private const val DEFAULT_OUTER_WIDTH_RATIO = 0.35
    private const val DEFAULT_SPEED_MULTIPLIER = 1.0
    private const val MIN_SPEED_MULTIPLIER = 0.25
    private const val MAX_SPEED_MULTIPLIER = 16.0
    private const val DEFAULT_CAMERA_TILT = 65.0
    private const val MIN_TILT_DEGREES = 0.0
    private const val MAX_TILT_DEGREES = 85.0
    private const val DEFAULT_CAMERA_RANGE = 800.0
    private const val MIN_RANGE_METERS = 50.0
    private const val MAX_RANGE_METERS = 20_000.0
    private const val CAMERA_GROUND_OFFSET_METERS = 20.0

    private const val MIN_KEYFRAME_DISTANCE_METERS = 150.0
    private const val MIN_TURN_DISTANCE_METERS = 45.0
    private const val MIN_HEADING_CHANGE_DEGREES = 22.0
    private const val MAX_KEYFRAMES = 120
    private const val LOOK_AHEAD_STEPS = 2

    private const val BASE_FLYOVER_SPEED_MPS = 90.0
    private const val MIN_BASE_SPEED_MPS = 20.0
    private const val MAX_BASE_SPEED_MPS = 400.0
    private const val INITIAL_FLY_TO_DURATION_MS = 6_000L
    private const val MIN_SEGMENT_DURATION_MS = 700.0
    private const val MAX_SEGMENT_DURATION_MS = 4_000.0

    private var activeInstance: WeakReference<GoogleMap3DContainer>? = null

    private fun releaseExistingActiveInstance(except: GoogleMap3DContainer) {
      val existing = activeInstance?.get()
      if (existing != null && existing !== except) {
        existing.destroyMapInstance()
      }
    }

    private fun parseTrackPoints(rawCoordinates: List<Map<String, Any?>>): List<TrackPoint> {
      val result = ArrayList<TrackPoint>(rawCoordinates.size)
      for (entry in rawCoordinates) {
        val lat = (entry["latitude"] as? Number)?.toDouble() ?: continue
        val lon = (entry["longitude"] as? Number)?.toDouble() ?: continue
        if (!lat.isFinite() || !lon.isFinite()) continue
        val alt = (entry["altitude"] as? Number)?.toDouble()?.takeIf { it.isFinite() } ?: 0.0
        result.add(TrackPoint(latitude = lat, longitude = lon, altitude = alt))
      }
      return result
    }

    private fun parseColorOrDefault(colorHex: String?, fallback: Int): Int {
      if (colorHex.isNullOrBlank()) return fallback
      return try {
        Color.parseColor(colorHex)
      } catch (_: IllegalArgumentException) {
        fallback
      }
    }

    private fun haversineMeters(a: TrackPoint, b: TrackPoint): Double {
      val lat1 = Math.toRadians(a.latitude)
      val lat2 = Math.toRadians(b.latitude)
      val dLat = lat2 - lat1
      val dLon = Math.toRadians(b.longitude - a.longitude)
      val sinHalfLat = sin(dLat / 2.0)
      val sinHalfLon = sin(dLon / 2.0)
      val h = sinHalfLat * sinHalfLat + cos(lat1) * cos(lat2) * sinHalfLon * sinHalfLon
      val c = 2.0 * atan2(sqrt(h), sqrt(max(0.0, 1.0 - h)))
      return EARTH_RADIUS_METERS * c
    }

    private fun computeBearing(from: TrackPoint, to: TrackPoint): Double {
      val lat1 = Math.toRadians(from.latitude)
      val lat2 = Math.toRadians(to.latitude)
      val dLon = Math.toRadians(to.longitude - from.longitude)
      val y = sin(dLon) * cos(lat2)
      val x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dLon)
      return normalizeBearing(Math.toDegrees(atan2(y, x)))
    }

    private fun normalizeBearing(degrees: Double): Double {
      val mod = degrees % 360.0
      return if (mod < 0.0) mod + 360.0 else mod
    }

    private fun shortestAngularDelta(fromDeg: Double, toDeg: Double): Double {
      val diff = (normalizeBearing(toDeg) - normalizeBearing(fromDeg) + 540.0) % 360.0 - 180.0
      return kotlin.math.abs(diff)
    }
  }
}
