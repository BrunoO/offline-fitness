import ExpoModulesCore

/**
 * iOS stub (docs/recording-plan.md D6/D7): the module exists so the iOS build
 * links and the JS bundle can ask about capabilities, but it records nothing.
 * `canRecord: false` is a capability, not an error, so the screen can explain
 * the situation instead of handling an exception.
 */
public class GpsTrackerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("GpsTracker")

    Events("onTick")

    AsyncFunction("getCapabilities") { () -> [String: Any] in
      [
        "canRecord": false,
        "hasBarometer": false,
        "canExemptBattery": false
      ]
    }

    AsyncFunction("start") { () -> Bool in
      throw RecordingUnavailableException()
    }

    AsyncFunction("stop") { () -> Bool in
      throw RecordingUnavailableException()
    }

    AsyncFunction("getTickCount") { () -> Int in
      0
    }
  }
}

internal final class RecordingUnavailableException: Exception {
  override var reason: String {
    "Recording is Android-only in this build."
  }
}
