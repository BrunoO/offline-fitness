import ExpoModulesCore

public class HeartRateModule: Module {
  public func definition() -> ModuleDefinition {
    Name("HeartRate")

    Events("onDeviceFound", "onScanStateChanged", "onConnectionStateChanged", "onHeartRate", "onBatteryLevel")

    AsyncFunction("getCapabilities") { () -> [String: Any] in
      [
        "canScan": false,
        "canConnect": false,
        "platform": "ios"
      ]
    }

    AsyncFunction("startScan") {
      throw HeartRateUnavailableException()
    }

    AsyncFunction("stopScan") {
      // No-op.
    }

    AsyncFunction("connectToDevice") { (_ deviceId: String) in
      throw HeartRateUnavailableException()
    }

    AsyncFunction("disconnectFromDevice") { (_ deviceId: String) in
      // No-op.
    }

    AsyncFunction("startHrStreaming") { (_ deviceId: String) in
      throw HeartRateUnavailableException()
    }

    AsyncFunction("stopHrStreaming") { (_ deviceId: String) in
      // No-op.
    }

    AsyncFunction("getConnectedDeviceId") { () -> String? in
      nil
    }
  }
}

internal final class HeartRateUnavailableException: Exception {
  override var reason: String {
    "Heart-rate scanning is iOS-only-stub in this build."
  }
}
