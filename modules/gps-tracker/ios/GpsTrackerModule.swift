import ExpoModulesCore

/**
 * iOS stub (docs/recording-plan.md D6/D7): the module exists so the iOS build
 * links and the JS bundle can ask about capabilities, but it records nothing.
 * `canRecord: false` is a capability, not an error, so the screen can explain
 * the situation instead of handling an exception.
 *
 * The function names mirror the Android module one for one, so the app never
 * branches on the platform - only on `canRecord`.
 */
public class GpsTrackerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("GpsTracker")

    Events("onStateChange", "onLocationUpdate")

    AsyncFunction("getCapabilities") { () -> [String: Any] in
      [
        "canRecord": false,
        "hasBarometer": false,
        "canExemptBattery": false
      ]
    }

    AsyncFunction("requestIgnoreBatteryOptimization") { () -> Bool in
      false
    }

    AsyncFunction("startRecording") { (_ options: [String: Any]) -> [String: Any] in
      throw RecordingUnavailableException()
    }

    AsyncFunction("pauseRecording") {
      throw RecordingUnavailableException()
    }

    AsyncFunction("resumeRecording") {
      throw RecordingUnavailableException()
    }

    AsyncFunction("stopRecording") { () -> [String: Any] in
      throw RecordingUnavailableException()
    }

    AsyncFunction("getRecordingState") { () -> [String: Any] in
      [
        "phase": "idle"
      ]
    }

    AsyncFunction("getSessionMeta") { (_ sessionId: String?) -> [String: Any] in
      throw RecordingUnavailableException()
    }

    AsyncFunction("listSessions") { () -> [[String: Any]] in
      []
    }

    AsyncFunction("getStorageSize") { () -> Int in
      0
    }

    AsyncFunction("deleteAllSessions") {
      // No sessions exist on iOS; nothing to delete.
    }

    AsyncFunction("markSessionSaved") { (_ sessionId: String, _ activityId: String) in
      throw RecordingUnavailableException()
    }

    AsyncFunction("discardSession") { (_ sessionId: String) in
      throw RecordingUnavailableException()
    }
  }
}

internal final class RecordingUnavailableException: Exception {
  override var reason: String {
    "Recording is Android-only in this build."
  }
}
