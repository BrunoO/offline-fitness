package com.offlinefitness.maps3d

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class GoogleMaps3DModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("GoogleMaps3D")

    View(GoogleMap3DContainer::class) {
      Events(
        "onMapReady",
        "onMapError",
        "onFlyoverProgress",
        "onFlyoverComplete",
        "onUserInteraction"
      )

      Prop("coordinates") { view: GoogleMap3DContainer, coordinates: List<Map<String, Any?>>? ->
        view.setCoordinates(coordinates.orEmpty())
      }

      Prop("strokeColor") { view: GoogleMap3DContainer, strokeColor: String? ->
        view.setStrokeColor(strokeColor)
      }

      Prop("strokeWidth") { view: GoogleMap3DContainer, strokeWidth: Double? ->
        view.setStrokeWidth(strokeWidth)
      }

      Prop("isPlaying") { view: GoogleMap3DContainer, isPlaying: Boolean? ->
        view.setIsPlaying(isPlaying == true)
      }

      Prop("speedMultiplier") { view: GoogleMap3DContainer, speedMultiplier: Double? ->
        view.setSpeedMultiplier(speedMultiplier)
      }

      Prop("baseSpeedMps") { view: GoogleMap3DContainer, baseSpeedMps: Double? ->
        view.setBaseSpeedMps(baseSpeedMps)
      }

      Prop("cameraTilt") { view: GoogleMap3DContainer, cameraTilt: Double? ->
        view.setCameraTilt(cameraTilt)
      }

      Prop("cameraRange") { view: GoogleMap3DContainer, cameraRange: Double? ->
        view.setCameraRange(cameraRange)
      }

      Prop("mapMode") { view: GoogleMap3DContainer, mapMode: String? ->
        view.setMapMode(mapMode)
      }

      AsyncFunction("restartFlyover") { view: GoogleMap3DContainer ->
        view.restartFlyover()
      }

      AsyncFunction("seekTo") { view: GoogleMap3DContainer, progress: Double ->
        view.seekTo(progress)
      }

      OnViewDestroys { view: GoogleMap3DContainer ->
        view.destroyMapInstance()
      }
    }
  }
}
