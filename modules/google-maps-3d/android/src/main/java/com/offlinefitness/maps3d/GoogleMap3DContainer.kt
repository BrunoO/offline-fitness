package com.offlinefitness.maps3d

import android.content.Context
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Choreographer
import android.view.MotionEvent
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.ReactContext
import com.google.android.gms.maps3d.GoogleMap3D
import com.google.android.gms.maps3d.Map3DView
import com.google.android.gms.maps3d.OnMap3DViewReadyCallback
import com.google.android.gms.maps3d.model.AltitudeMode
import com.google.android.gms.maps3d.model.Camera
import com.google.android.gms.maps3d.model.CollisionBehavior
import com.google.android.gms.maps3d.model.FlyAroundOptions
import com.google.android.gms.maps3d.model.FlyToOptions
import com.google.android.gms.maps3d.model.LatLngAltitude
import com.google.android.gms.maps3d.model.Map3DMode
import com.google.android.gms.maps3d.model.Marker
import com.google.android.gms.maps3d.model.MarkerOptions
import com.google.android.gms.maps3d.model.PinConfiguration
import com.google.android.gms.maps3d.model.Polyline
import com.google.android.gms.maps3d.model.PolylineOptions
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.lang.ref.WeakReference
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.exp
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

private data class SampledTrackPoint(
  val point: TrackPoint,
  val segmentIndex: Int
)

class GoogleMap3DContainer(
  context: Context,
  appContext: AppContext
) : ExpoView(context, appContext), OnMap3DViewReadyCallback, LifecycleEventListener {

  override val shouldUseAndroidLayout: Boolean = true

  private val onMapReady by EventDispatcher()
  private val onMapError by EventDispatcher()
  private val onFlyoverProgress by EventDispatcher()
  private val onFlyoverComplete by EventDispatcher()
  private val onUserInteraction by EventDispatcher()

  private val mainHandler = Handler(Looper.getMainLooper())
  private val reactContext: ReactContext? =
    (appContext.reactContext as? ReactContext) ?: (context as? ReactContext)

  private var map3DView: Map3DView? = null
  private var googleMap3D: GoogleMap3D? = null
  private val traveledPolylines = mutableListOf<Polyline>()
  private var drawnUpToDistanceMeters: Double = 0.0
  private var drawnUpToSegmentIndex: Int = 0
  private var lastDrawnLatLng: LatLngAltitude? = null
  private var startMarker: Marker? = null
  private var summitMarker: Marker? = null
  private var finishMarker: Marker? = null
  private var beaconMarker: Marker? = null
  private var summitSourceIndex: Int = -1

  private var isLifecycleRegistered = false
  private var isStarted = false
  private var isResumed = false
  private var isDestroyed = false

  // Track & polyline state
  private var pendingCoordinates: List<TrackPoint>? = null
  private var currentTrack: List<TrackPoint> = emptyList()
  private var fullTrackLatLng: List<LatLngAltitude> = emptyList()
  private var trackDistances: DoubleArray = DoubleArray(0)
  private var totalTrackDistance: Double = 0.0
  private var strokeColorInt: Int = DEFAULT_STROKE_COLOR
  private var strokeWidthPx: Double = DEFAULT_STROKE_WIDTH
  private var currentMapMode: Int = Map3DMode.HYBRID

  // Continuous 60fps flyover animation state
  private var desiredPlaying: Boolean = false
  private var isAnimating: Boolean = false
  private var isCompleted: Boolean = false
  private var currentDistanceMeters: Double = 0.0
  private var pendingSeekProgress: Double? = null
  private var speedMultiplier: Double = DEFAULT_SPEED_MULTIPLIER
  private var baseSpeedMps: Double = BASE_FLYOVER_SPEED_MPS
  private var cameraTilt: Double = DEFAULT_CAMERA_TILT
  private var cameraRange: Double = DEFAULT_CAMERA_RANGE
  private var renderedTilt: Double = DEFAULT_CAMERA_TILT
  private var renderedRange: Double = DEFAULT_CAMERA_RANGE
  private var smoothedHeadingDegrees: Double = 0.0
  private var hasSmoothedHeading: Boolean = false
  private var lastFrameTimeNanos: Long = 0L
  private var lastPolylineUpdateNanos: Long = 0L
  private var lastPolylineDistanceMeters: Double = -1.0
  private var lastProgressEmitNanos: Long = 0L

  private val frameCallback = Choreographer.FrameCallback { frameTimeNanos ->
    onAnimationFrame(frameTimeNanos)
  }

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

  override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
    if (ev.actionMasked == MotionEvent.ACTION_DOWN && isAnimating && desiredPlaying) {
      desiredPlaying = false
      pauseAnimationInternal()
      onUserInteraction(emptyMap())
    }
    return super.dispatchTouchEvent(ev)
  }

  // ---------------------------------------------------------------------------
  // LifecycleEventListener (strict Map3DView lifecycle relay)
  // ---------------------------------------------------------------------------

  override fun onHostResume() {
    if (isDestroyed) return
    mainHandler.post {
      if (isDestroyed) return@post
      startAndResumeMap()
      if (desiredPlaying && !isAnimating && !isCompleted && currentTrack.size >= 2 && googleMap3D != null) {
        resumeFlyoverFromCurrentDistance()
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
    stopFrameLoop()

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

    clearTraveledPolylines()
    clearMilestoneMarkers()
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
    try {
      beaconMarker?.setStylePinConfiguration(buildBeaconPinConfig())
    } catch (e: Exception) {
      Log.w(TAG, "Error updating beacon color", e)
    }
    if (traveledPolylines.isNotEmpty()) {
      rebuildTraveledPolylineAtDistance(currentDistanceMeters)
    }
  }

  fun setStrokeWidth(width: Double?) {
    val nextWidth = (width ?: DEFAULT_STROKE_WIDTH).coerceIn(1.0, 64.0)
    if (nextWidth == strokeWidthPx) return
    strokeWidthPx = nextWidth
    if (traveledPolylines.isNotEmpty()) {
      rebuildTraveledPolylineAtDistance(currentDistanceMeters)
    }
  }

  fun setIsPlaying(playing: Boolean) {
    desiredPlaying = playing
    if (googleMap3D == null || currentTrack.size < 2) {
      return
    }
    if (playing) {
      if (isCompleted) {
        currentDistanceMeters = 0.0
        isCompleted = false
        hasSmoothedHeading = false
        rebuildTraveledPolylineAtDistance(0.0)
        snapCameraToCurrentDistance()
        emitProgress(0.0)
      }
      if (!isAnimating) {
        resumeFlyoverFromCurrentDistance()
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
    if (!isAnimating && googleMap3D != null && currentTrack.size >= 2) {
      renderedTilt = next
      snapCameraToCurrentDistance()
    }
  }

  fun setCameraRange(range: Double?) {
    val next = (range ?: DEFAULT_CAMERA_RANGE).coerceIn(MIN_RANGE_METERS, MAX_RANGE_METERS)
    if (next == cameraRange) return
    cameraRange = next
    if (!isAnimating && googleMap3D != null && currentTrack.size >= 2) {
      renderedRange = next
      snapCameraToCurrentDistance()
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
      if (isDestroyed || googleMap3D == null || currentTrack.size < 2) return@post
      pauseAnimationInternal()
      pendingSeekProgress = null
      currentDistanceMeters = 0.0
      isCompleted = false
      hasSmoothedHeading = false
      renderedTilt = cameraTilt
      renderedRange = cameraRange
      rebuildTraveledPolylineAtDistance(0.0)
      snapCameraToCurrentDistance()
      emitProgress(0.0)
      if (desiredPlaying) {
        resumeFlyoverFromCurrentDistance()
      }
    }
  }

  fun seekTo(progressPercent: Double) {
    val clamped = progressPercent.coerceIn(0.0, 100.0)
    mainHandler.post {
      if (isDestroyed) return@post
      if (googleMap3D == null || currentTrack.size < 2) {
        pendingSeekProgress = clamped
        return@post
      }
      pauseAnimationInternal()
      pendingSeekProgress = null
      currentDistanceMeters = distanceForProgress(clamped)
      isCompleted = currentDistanceMeters >= totalTrackDistance - COMPLETION_EPSILON_METERS
      hasSmoothedHeading = false
      renderedTilt = cameraTilt
      renderedRange = cameraRange
      rebuildTraveledPolylineAtDistance(currentDistanceMeters)
      snapCameraToCurrentDistance()
      emitProgress(progressForDistance(currentDistanceMeters))
      if (desiredPlaying && !isCompleted) {
        resumeFlyoverFromCurrentDistance()
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 3D Polyline Rendering (append-only during playback for thread safety)
  // ---------------------------------------------------------------------------

  private fun applyTrackToMap(points: List<TrackPoint>) {
    if (googleMap3D == null) return
    pauseAnimationInternal()
    clearTraveledPolylines()
    clearMilestoneMarkers()

    if (points.size < 2) {
      fullTrackLatLng = emptyList()
      trackDistances = DoubleArray(0)
      totalTrackDistance = 0.0
      summitSourceIndex = -1
      currentDistanceMeters = 0.0
      hasSmoothedHeading = false
      isCompleted = false
      return
    }

    fullTrackLatLng = points.map {
      LatLngAltitude(it.latitude, it.longitude, POLYLINE_MESH_OFFSET_METERS)
    }
    trackDistances = computeCumulativeDistances(points)
    totalTrackDistance = trackDistances.lastOrNull() ?: 0.0
    summitSourceIndex = findSummitSourceIndex(points)

    val initialSeek = pendingSeekProgress
    pendingSeekProgress = null
    currentDistanceMeters = if (initialSeek != null) distanceForProgress(initialSeek) else 0.0
    isCompleted = currentDistanceMeters >= totalTrackDistance - COMPLETION_EPSILON_METERS
    hasSmoothedHeading = false
    renderedTilt = cameraTilt
    renderedRange = cameraRange
    lastPolylineDistanceMeters = -1.0

    rebuildTraveledPolylineAtDistance(currentDistanceMeters)
    emitProgress(progressForDistance(currentDistanceMeters))

    if (desiredPlaying && !isCompleted) {
      snapCameraToCurrentDistance()
      resumeFlyoverFromCurrentDistance()
    } else {
      flyCameraToInitialDistance()
    }
  }

  private fun clearTraveledPolylines() {
    for (polyline in traveledPolylines) {
      try {
        polyline.remove()
      } catch (e: Exception) {
        Log.w(TAG, "Error removing polyline", e)
      }
    }
    traveledPolylines.clear()
    drawnUpToDistanceMeters = 0.0
    drawnUpToSegmentIndex = 0
    lastDrawnLatLng = null
    lastPolylineDistanceMeters = -1.0
  }

  private fun buildPolylineOptions(path: List<LatLngAltitude>): PolylineOptions {
    return PolylineOptions().apply {
      setPath(path)
      setAltitudeMode(AltitudeMode.RELATIVE_TO_MESH)
      setStrokeColor(strokeColorInt)
      setStrokeWidth(strokeWidthPx)
      setOuterColor(Color.WHITE)
      setOuterWidth(DEFAULT_OUTER_WIDTH_RATIO)
      setDrawsOccludedSegments(true)
      setZIndex(POLYLINE_Z_INDEX)
    }
  }

  private fun sanitizePolylinePath(rawPath: List<LatLngAltitude>): List<LatLngAltitude> {
    if (rawPath.size < 2) return emptyList()
    val result = ArrayList<LatLngAltitude>(rawPath.size)
    var lastKept: LatLngAltitude? = null
    for (pt in rawPath) {
      if (!pt.latitude.isFinite() || !pt.longitude.isFinite() || !pt.altitude.isFinite()) continue
      val prev = lastKept
      if (prev == null || haversineLatLngMeters(prev, pt) >= MIN_POLYLINE_VERTEX_SPACING_METERS) {
        result.add(pt)
        lastKept = pt
      }
    }
    return if (result.size >= 2) result else emptyList()
  }

  private fun rebuildTraveledPolylineAtDistance(
    distanceMeters: Double,
    preSampled: SampledTrackPoint? = null
  ) {
    val map = googleMap3D ?: return
    clearTraveledPolylines()
    if (fullTrackLatLng.size < 2 || trackDistances.size != fullTrackLatLng.size) {
      return
    }
    val sampled = preSampled ?: sampleTrackAtDistance(distanceMeters)
    val reachedEnd = distanceMeters >= totalTrackDistance - COMPLETION_EPSILON_METERS
    val markerSourceIndex = if (reachedEnd) currentTrack.lastIndex else sampled.segmentIndex
    syncMilestoneMarkers(markerSourceIndex)

    if (distanceMeters < MIN_VISIBLE_POLYLINE_METERS) {
      return
    }

    val rawPath = ArrayList<LatLngAltitude>(sampled.segmentIndex + 2)
    val prefixEnd = min(sampled.segmentIndex + 1, fullTrackLatLng.size)
    rawPath.addAll(fullTrackLatLng.subList(0, prefixEnd))
    val tip = if (reachedEnd) {
      fullTrackLatLng.last()
    } else {
      LatLngAltitude(sampled.point.latitude, sampled.point.longitude, POLYLINE_MESH_OFFSET_METERS)
    }
    rawPath.add(tip)
    val sanitizedPath = sanitizePolylinePath(rawPath)
    if (sanitizedPath.size < 2) {
      return
    }

    map.addPolyline(buildPolylineOptions(sanitizedPath))?.let { traveledPolylines.add(it) }
    drawnUpToDistanceMeters = distanceMeters
    drawnUpToSegmentIndex = sampled.segmentIndex
    lastDrawnLatLng = sanitizedPath.last()
    lastPolylineDistanceMeters = distanceMeters
  }

  private fun appendTraveledPolylineTo(
    distanceMeters: Double,
    sampled: SampledTrackPoint
  ) {
    val map = googleMap3D ?: return
    if (fullTrackLatLng.size < 2 || trackDistances.size != fullTrackLatLng.size) {
      return
    }
    val reachedEnd = distanceMeters >= totalTrackDistance - COMPLETION_EPSILON_METERS
    val markerSourceIndex = if (reachedEnd) currentTrack.lastIndex else sampled.segmentIndex
    syncMilestoneMarkers(markerSourceIndex)

    if (distanceMeters < MIN_VISIBLE_POLYLINE_METERS) {
      return
    }
    if (lastDrawnLatLng == null || distanceMeters < drawnUpToDistanceMeters) {
      rebuildTraveledPolylineAtDistance(distanceMeters, sampled)
      return
    }

    // Append-only incremental chunk with strict vertex deduplication: Maps3DDynamite's C++
    // tessellator aborts with bad_optional_access on zero-length/duplicate consecutive vertices.
    val rawChunk = ArrayList<LatLngAltitude>(max(2, sampled.segmentIndex - drawnUpToSegmentIndex + 2))
    rawChunk.add(lastDrawnLatLng!!)
    val nextVertexStart = drawnUpToSegmentIndex + 1
    val nextVertexEnd = min(sampled.segmentIndex, fullTrackLatLng.lastIndex)
    for (i in nextVertexStart..nextVertexEnd) {
      rawChunk.add(fullTrackLatLng[i])
    }
    val tip = if (reachedEnd) {
      fullTrackLatLng.last()
    } else {
      LatLngAltitude(sampled.point.latitude, sampled.point.longitude, POLYLINE_MESH_OFFSET_METERS)
    }
    rawChunk.add(tip)

    val sanitizedChunk = sanitizePolylinePath(rawChunk)
    if (sanitizedChunk.size >= 2) {
      map.addPolyline(buildPolylineOptions(sanitizedChunk))?.let { traveledPolylines.add(it) }
      drawnUpToDistanceMeters = distanceMeters
      drawnUpToSegmentIndex = sampled.segmentIndex
      lastDrawnLatLng = sanitizedChunk.last()
      lastPolylineDistanceMeters = distanceMeters
    }
  }

  // ---------------------------------------------------------------------------
  // Continuous 60fps Flyover Camera Engine
  // ---------------------------------------------------------------------------

  private fun snapCameraToCurrentDistance() {
    val map = googleMap3D ?: return
    if (currentTrack.size < 2) return
    val sampled = sampleTrackAtDistance(currentDistanceMeters)
    val heading = computeTargetHeading(currentDistanceMeters, sampled.point)
    smoothedHeadingDegrees = heading
    hasSmoothedHeading = true
    updateBeaconMarker(sampled.point)
    map.setCamera(buildCamera(sampled.point, heading, renderedTilt, renderedRange))
  }

  private fun flyCameraToInitialDistance() {
    val map = googleMap3D ?: return
    if (currentTrack.size < 2) return
    val sampled = sampleTrackAtDistance(currentDistanceMeters)
    val heading = computeTargetHeading(currentDistanceMeters, sampled.point)
    smoothedHeadingDegrees = heading
    hasSmoothedHeading = true
    updateBeaconMarker(sampled.point)
    map.flyCameraTo(
      FlyToOptions(buildCamera(sampled.point, heading, renderedTilt, renderedRange), INITIAL_FLY_TO_DURATION_MS)
    )
  }

  private fun startFinishOrbit() {
    val map = googleMap3D ?: return
    if (isDestroyed || currentTrack.size < 2) return
    val finishPoint = currentTrack.last()
    val approachHeading = if (hasSmoothedHeading) {
      smoothedHeadingDegrees
    } else {
      computeTargetHeading(totalTrackDistance, finishPoint)
    }
    val orbitCamera = Camera(
      LatLngAltitude(finishPoint.latitude, finishPoint.longitude, CAMERA_GROUND_OFFSET_METERS),
      normalizeBearing(approachHeading),
      FINISH_ORBIT_TILT_DEGREES,
      0.0,
      max(cameraRange, FINISH_ORBIT_MIN_RANGE_METERS),
      AltitudeMode.RELATIVE_TO_GROUND
    )
    try {
      map.flyCameraAround(
        FlyAroundOptions(orbitCamera, FINISH_ORBIT_DURATION_MS, FINISH_ORBIT_ROUNDS)
      )
    } catch (e: Exception) {
      Log.w(TAG, "Finish orbit warning", e)
    }
  }

  private fun clearMilestoneMarkers() {
    try {
      startMarker?.remove()
      summitMarker?.remove()
      finishMarker?.remove()
      beaconMarker?.remove()
    } catch (e: Exception) {
      Log.w(TAG, "Error removing milestone markers", e)
    }
    startMarker = null
    summitMarker = null
    finishMarker = null
    beaconMarker = null
  }

  private fun buildBeaconPinConfig(): PinConfiguration {
    return PinConfiguration().apply {
      setBackgroundColor(strokeColorInt)
      setBorderColor(Color.WHITE)
      setScale(BEACON_PIN_SCALE)
    }
  }

  private fun updateBeaconMarker(point: TrackPoint) {
    val map = googleMap3D ?: return
    if (isDestroyed) return
    val pos = LatLngAltitude(point.latitude, point.longitude, BEACON_MESH_OFFSET_METERS)
    val existing = beaconMarker
    if (existing != null) {
      try {
        existing.setPosition(pos)
      } catch (e: Exception) {
        Log.w(TAG, "Error updating beacon position", e)
      }
      return
    }
    beaconMarker = try {
      val options = MarkerOptions().apply {
        setPosition(pos)
        setAltitudeMode(AltitudeMode.RELATIVE_TO_MESH)
        setExtruded(true)
        setDrawnWhenOccluded(true)
        setSizePreserved(true)
        setCollisionBehavior(CollisionBehavior.REQUIRED)
        setZIndex(BEACON_Z_INDEX)
        setStyle(buildBeaconPinConfig())
      }
      map.addMarker(options)
    } catch (e: Exception) {
      Log.w(TAG, "Failed to add 3D position beacon", e)
      null
    }
  }

  private fun syncMilestoneMarkers(endSourceIndex: Int) {
    val map = googleMap3D ?: return
    if (currentTrack.size < 2) return

    if (startMarker == null) {
      startMarker = addExtrudedMarker(
        map = map,
        point = currentTrack.first(),
        label = "Start",
        stemHeightMeters = START_MARKER_HEIGHT_METERS
      )
    }

    val summitIdx = summitSourceIndex
    if (summitIdx in currentTrack.indices && endSourceIndex >= summitIdx) {
      if (summitMarker == null) {
        val summit = currentTrack[summitIdx]
        val elevLabel = "Summit · ${summit.altitude.roundToLong()} m"
        summitMarker = addExtrudedMarker(
          map = map,
          point = summit,
          label = elevLabel,
          stemHeightMeters = SUMMIT_MARKER_HEIGHT_METERS
        )
      }
    } else if (summitMarker != null) {
      summitMarker?.remove()
      summitMarker = null
    }

    if (endSourceIndex >= currentTrack.lastIndex) {
      if (finishMarker == null) {
        finishMarker = addExtrudedMarker(
          map = map,
          point = currentTrack.last(),
          label = "Finish",
          stemHeightMeters = FINISH_MARKER_HEIGHT_METERS
        )
      }
    } else if (finishMarker != null) {
      finishMarker?.remove()
      finishMarker = null
    }
  }

  private fun addExtrudedMarker(
    map: GoogleMap3D,
    point: TrackPoint,
    label: String,
    stemHeightMeters: Double
  ): Marker? {
    return try {
      val options = MarkerOptions().apply {
        setPosition(LatLngAltitude(point.latitude, point.longitude, stemHeightMeters))
        setLabel(label)
        setAltitudeMode(AltitudeMode.RELATIVE_TO_GROUND)
        setExtruded(true)
        setDrawnWhenOccluded(true)
        setCollisionBehavior(CollisionBehavior.REQUIRED_AND_HIDES_OPTIONAL)
      }
      map.addMarker(options)
    } catch (e: Exception) {
      Log.w(TAG, "Failed to add 3D marker '$label'", e)
      null
    }
  }

  private fun findSummitSourceIndex(points: List<TrackPoint>): Int {
    if (points.size < 3) return -1
    var maxIndex = -1
    var maxAlt = Double.NEGATIVE_INFINITY
    for (i in 1 until points.lastIndex) {
      val alt = points[i].altitude
      if (alt.isFinite() && alt > maxAlt) {
        maxAlt = alt
        maxIndex = i
      }
    }
    if (maxIndex == -1) return -1
    val startAlt = points.first().altitude
    val gainAboveStart = maxAlt - startAlt
    if (gainAboveStart < MIN_SUMMIT_PROMINENCE_METERS) return -1
    val distFromStart = haversineMeters(points.first(), points[maxIndex])
    val distFromFinish = haversineMeters(points.last(), points[maxIndex])
    if (distFromStart < MIN_SUMMIT_SEPARATION_METERS || distFromFinish < MIN_SUMMIT_SEPARATION_METERS) {
      return -1
    }
    return maxIndex
  }

  private fun resumeFlyoverFromCurrentDistance() {
    if (isDestroyed || googleMap3D == null || currentTrack.size < 2) return
    if (currentDistanceMeters >= totalTrackDistance - COMPLETION_EPSILON_METERS) {
      isCompleted = true
      stopFrameLoop()
      emitProgress(100.0)
      onFlyoverComplete(emptyMap())
      return
    }
    try {
      // Cancel any in-flight initial flyCameraTo glide or finish orbit before taking frame control.
      googleMap3D?.stopCameraAnimation()
    } catch (e: Exception) {
      Log.w(TAG, "Error cancelling camera animation on resume", e)
    }
    isAnimating = true
    lastFrameTimeNanos = 0L
    lastPolylineUpdateNanos = 0L
    lastProgressEmitNanos = 0L
    Choreographer.getInstance().removeFrameCallback(frameCallback)
    Choreographer.getInstance().postFrameCallback(frameCallback)
  }

  private fun stopFrameLoop() {
    isAnimating = false
    lastFrameTimeNanos = 0L
    Choreographer.getInstance().removeFrameCallback(frameCallback)
  }

  private fun pauseAnimationInternal() {
    val wasAnimating = isAnimating
    stopFrameLoop()
    if (wasAnimating) {
      try {
        googleMap3D?.stopCameraAnimation()
      } catch (e: Exception) {
        Log.w(TAG, "Error stopping camera animation", e)
      }
    }
  }

  private fun onAnimationFrame(frameTimeNanos: Long) {
    if (isDestroyed || !isAnimating || !desiredPlaying) return
    val map = googleMap3D ?: return
    if (currentTrack.size < 2 || totalTrackDistance <= 0.0) {
      stopFrameLoop()
      return
    }

    val dtSeconds = if (lastFrameTimeNanos == 0L) {
      0.0
    } else {
      ((frameTimeNanos - lastFrameTimeNanos) / 1_000_000_000.0).coerceIn(0.0, MAX_FRAME_DT_SECONDS)
    }
    lastFrameTimeNanos = frameTimeNanos

    val stepMeters = baseSpeedMps * speedMultiplier * dtSeconds
    currentDistanceMeters = min(currentDistanceMeters + stepMeters, totalTrackDistance)

    val sampled = sampleTrackAtDistance(currentDistanceMeters)
    val targetHeading = computeTargetHeading(currentDistanceMeters, sampled.point)
    if (!hasSmoothedHeading) {
      smoothedHeadingDegrees = targetHeading
      hasSmoothedHeading = true
    } else if (dtSeconds > 0.0) {
      val headingAlpha = 1.0 - exp(-dtSeconds / HEADING_SMOOTHING_TAU_SEC)
      val delta = shortestSignedAngularDelta(smoothedHeadingDegrees, targetHeading)
      smoothedHeadingDegrees = normalizeBearing(smoothedHeadingDegrees + delta * headingAlpha)
    }

    if (dtSeconds > 0.0) {
      val (targetTilt, targetRange) = computeTerrainReactiveCameraTargets(currentDistanceMeters)
      val paramAlpha = 1.0 - exp(-dtSeconds / CAMERA_PARAM_SMOOTHING_TAU_SEC)
      renderedTilt += (targetTilt - renderedTilt) * paramAlpha
      renderedRange += (targetRange - renderedRange) * paramAlpha
    }

    map.setCamera(buildCamera(sampled.point, smoothedHeadingDegrees, renderedTilt, renderedRange))

    val reachedEnd = currentDistanceMeters >= totalTrackDistance - COMPLETION_EPSILON_METERS
    val polylineDue = reachedEnd ||
      lastPolylineUpdateNanos == 0L ||
      (frameTimeNanos - lastPolylineUpdateNanos >= POLYLINE_UPDATE_INTERVAL_NANOS &&
        abs(currentDistanceMeters - lastPolylineDistanceMeters) >= MIN_POLYLINE_STEP_METERS)
    if (polylineDue) {
      appendTraveledPolylineTo(currentDistanceMeters, sampled)
      lastPolylineUpdateNanos = frameTimeNanos
    }

    if (reachedEnd ||
      lastProgressEmitNanos == 0L ||
      frameTimeNanos - lastProgressEmitNanos >= PROGRESS_EMIT_INTERVAL_NANOS
    ) {
      updateBeaconMarker(sampled.point)
      emitProgress(progressForDistance(currentDistanceMeters))
      lastProgressEmitNanos = frameTimeNanos
    }

    if (reachedEnd) {
      stopFrameLoop()
      isCompleted = true
      onFlyoverComplete(emptyMap())
      startFinishOrbit()
      return
    }

    Choreographer.getInstance().postFrameCallback(frameCallback)
  }

  private fun computeCumulativeDistances(points: List<TrackPoint>): DoubleArray {
    val distances = DoubleArray(points.size)
    for (i in 1 until points.size) {
      distances[i] = distances[i - 1] + haversineMeters(points[i - 1], points[i])
    }
    return distances
  }

  private fun progressForDistance(distanceMeters: Double): Double {
    if (totalTrackDistance <= 0.0) return 100.0
    return ((distanceMeters / totalTrackDistance) * 100.0).coerceIn(0.0, 100.0)
  }

  private fun distanceForProgress(progressPercent: Double): Double {
    if (totalTrackDistance <= 0.0) return 0.0
    return (progressPercent.coerceIn(0.0, 100.0) / 100.0) * totalTrackDistance
  }

  private fun sampleTrackAtDistance(distanceMeters: Double): SampledTrackPoint {
    val lastIdx = currentTrack.lastIndex
    if (lastIdx <= 0 || totalTrackDistance <= 0.0) {
      return SampledTrackPoint(currentTrack.first(), 0)
    }
    val clamped = distanceMeters.coerceIn(0.0, totalTrackDistance)
    if (clamped >= totalTrackDistance) {
      return SampledTrackPoint(currentTrack.last(), lastIdx - 1)
    }

    var low = 0
    var high = lastIdx - 1
    while (low < high) {
      val mid = (low + high + 1) ushr 1
      if (trackDistances[mid] <= clamped) {
        low = mid
      } else {
        high = mid - 1
      }
    }

    val segStart = trackDistances[low]
    val segEnd = trackDistances[low + 1]
    val segLen = segEnd - segStart
    val fraction = if (segLen > 1e-6) ((clamped - segStart) / segLen).coerceIn(0.0, 1.0) else 0.0
    val a = currentTrack[low]
    val b = currentTrack[low + 1]
    val interpolated = TrackPoint(
      latitude = a.latitude + (b.latitude - a.latitude) * fraction,
      longitude = a.longitude + (b.longitude - a.longitude) * fraction,
      altitude = a.altitude + (b.altitude - a.altitude) * fraction
    )
    return SampledTrackPoint(interpolated, low)
  }

  private fun computeTargetHeading(distanceMeters: Double, currentPoint: TrackPoint): Double {
    if (currentTrack.size < 2 || totalTrackDistance <= 0.0) return 0.0
    val lookAheadMeters = (renderedRange * LOOK_AHEAD_RANGE_FACTOR)
      .coerceIn(MIN_LOOK_AHEAD_METERS, MAX_LOOK_AHEAD_METERS)
    if (distanceMeters < totalTrackDistance - 1.0) {
      val aheadPoint = sampleTrackAtDistance(min(distanceMeters + lookAheadMeters, totalTrackDistance)).point
      return computeBearing(currentPoint, aheadPoint)
    }
    val behindPoint = sampleTrackAtDistance(max(0.0, totalTrackDistance - lookAheadMeters)).point
    return computeBearing(behindPoint, currentPoint)
  }

  private fun computeLocalGrade(distanceMeters: Double): Double {
    if (currentTrack.size < 2 || totalTrackDistance < 20.0) return 0.0
    val dBehind = max(0.0, distanceMeters - GRADE_WINDOW_HALF_METERS)
    val dAhead = min(totalTrackDistance, distanceMeters + GRADE_WINDOW_HALF_METERS)
    val span = dAhead - dBehind
    if (span < 15.0) return 0.0
    val altBehind = sampleTrackAtDistance(dBehind).point.altitude
    val altAhead = sampleTrackAtDistance(dAhead).point.altitude
    if (!altBehind.isFinite() || !altAhead.isFinite()) return 0.0
    return ((altAhead - altBehind) / span).coerceIn(-0.25, 0.25)
  }

  private fun computeTerrainReactiveCameraTargets(distanceMeters: Double): Pair<Double, Double> {
    val grade = computeLocalGrade(distanceMeters)
    return when {
      grade > CLIMB_GRADE_START -> {
        val factor = ((grade - CLIMB_GRADE_START) / CLIMB_GRADE_SPAN).coerceIn(0.0, 1.0)
        val tilt = (cameraTilt - CLIMB_TILT_OFFSET_DEGREES * factor).coerceIn(MIN_TILT_DEGREES, MAX_TILT_DEGREES)
        val range = (cameraRange * (1.0 + CLIMB_RANGE_BOOST_FRACTION * factor)).coerceIn(MIN_RANGE_METERS, MAX_RANGE_METERS)
        tilt to range
      }
      grade < -DESCENT_GRADE_START -> {
        val factor = ((-grade - DESCENT_GRADE_START) / DESCENT_GRADE_SPAN).coerceIn(0.0, 1.0)
        val tilt = (cameraTilt + DESCENT_TILT_OFFSET_DEGREES * factor).coerceIn(MIN_TILT_DEGREES, MAX_TILT_DEGREES)
        val range = (cameraRange * (1.0 - DESCENT_RANGE_TUCK_FRACTION * factor)).coerceIn(MIN_RANGE_METERS, MAX_RANGE_METERS)
        tilt to range
      }
      else -> cameraTilt to cameraRange
    }
  }

  private fun buildCamera(
    point: TrackPoint,
    headingDegrees: Double,
    tiltDegrees: Double,
    rangeMeters: Double
  ): Camera {
    return Camera(
      LatLngAltitude(point.latitude, point.longitude, CAMERA_GROUND_OFFSET_METERS),
      normalizeBearing(headingDegrees),
      tiltDegrees,
      0.0,
      rangeMeters,
      AltitudeMode.RELATIVE_TO_GROUND
    )
  }

  private fun emitProgress(progressPercent: Double) {
    val clamped = progressPercent.coerceIn(0.0, 100.0)
    onFlyoverProgress(mapOf("progress" to clamped))
  }

  companion object {
    private const val TAG = "GoogleMap3DContainer"
    private const val EARTH_RADIUS_METERS = 6_371_000.0

    private val DEFAULT_STROKE_COLOR: Int = Color.parseColor("#FC4C02")
    private const val DEFAULT_STROKE_WIDTH = 9.0
    private const val DEFAULT_OUTER_WIDTH_RATIO = 0.25
    private const val POLYLINE_MESH_OFFSET_METERS = 2.0
    private const val MIN_POLYLINE_VERTEX_SPACING_METERS = 1.0
    private const val POLYLINE_Z_INDEX = 10
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

    private const val MAX_FRAME_DT_SECONDS = 0.1
    private const val HEADING_SMOOTHING_TAU_SEC = 1.2
    private const val CAMERA_PARAM_SMOOTHING_TAU_SEC = 0.6
    private const val GRADE_WINDOW_HALF_METERS = 80.0
    private const val CLIMB_GRADE_START = 0.05
    private const val CLIMB_GRADE_SPAN = 0.07
    private const val CLIMB_RANGE_BOOST_FRACTION = 0.25
    private const val CLIMB_TILT_OFFSET_DEGREES = 5.0
    private const val DESCENT_GRADE_START = 0.04
    private const val DESCENT_GRADE_SPAN = 0.06
    private const val DESCENT_RANGE_TUCK_FRACTION = 0.16
    private const val DESCENT_TILT_OFFSET_DEGREES = 4.0
    private const val BEACON_MESH_OFFSET_METERS = 6.0
    private const val BEACON_PIN_SCALE = 0.85f
    private const val BEACON_Z_INDEX = 20
    private const val LOOK_AHEAD_RANGE_FACTOR = 0.35
    private const val MIN_LOOK_AHEAD_METERS = 120.0
    private const val MAX_LOOK_AHEAD_METERS = 600.0
    private const val POLYLINE_UPDATE_INTERVAL_NANOS = 200_000_000L // ~5 Hz
    private const val MIN_POLYLINE_STEP_METERS = 15.0
    private const val MIN_VISIBLE_POLYLINE_METERS = 1.0
    private const val COMPLETION_EPSILON_METERS = 0.05
    private const val PROGRESS_EMIT_INTERVAL_NANOS = 66_000_000L // ~15 Hz

    private const val BASE_FLYOVER_SPEED_MPS = 90.0
    private const val MIN_BASE_SPEED_MPS = 20.0
    private const val MAX_BASE_SPEED_MPS = 400.0
    private const val INITIAL_FLY_TO_DURATION_MS = 6_000L
    private const val FINISH_ORBIT_DURATION_MS = 10_000L
    private const val FINISH_ORBIT_ROUNDS = 1.0
    private const val FINISH_ORBIT_TILT_DEGREES = 55.0
    private const val FINISH_ORBIT_MIN_RANGE_METERS = 900.0
    private const val START_MARKER_HEIGHT_METERS = 45.0
    private const val SUMMIT_MARKER_HEIGHT_METERS = 70.0
    private const val FINISH_MARKER_HEIGHT_METERS = 55.0
    private const val MIN_SUMMIT_PROMINENCE_METERS = 30.0
    private const val MIN_SUMMIT_SEPARATION_METERS = 100.0

    private var activeInstance: WeakReference<GoogleMap3DContainer>? = null

    private fun releaseExistingActiveInstance(except: GoogleMap3DContainer) {
      val existing = activeInstance?.get()
      if (existing != null && existing !== except) {
        existing.destroyMapInstance()
      }
    }

    private fun parseTrackPoints(rawCoordinates: List<Map<String, Any?>>): List<TrackPoint> {
      val result = ArrayList<TrackPoint>(rawCoordinates.size)
      var lastKept: TrackPoint? = null
      for (entry in rawCoordinates) {
        val lat = (entry["latitude"] as? Number)?.toDouble() ?: continue
        val lon = (entry["longitude"] as? Number)?.toDouble() ?: continue
        if (!lat.isFinite() || !lon.isFinite()) continue
        val alt = (entry["altitude"] as? Number)?.toDouble()?.takeIf { it.isFinite() } ?: 0.0
        val point = TrackPoint(latitude = lat, longitude = lon, altitude = alt)
        val prev = lastKept
        if (prev == null || haversineMeters(prev, point) >= 0.5) {
          result.add(point)
          lastKept = point
        }
      }
      return result
    }

    private fun haversineLatLngMeters(a: LatLngAltitude, b: LatLngAltitude): Double {
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

    private fun shortestSignedAngularDelta(fromDeg: Double, toDeg: Double): Double {
      return ((normalizeBearing(toDeg) - normalizeBearing(fromDeg) + 540.0) % 360.0) - 180.0
    }
  }
}
