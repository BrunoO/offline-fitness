import ExpoModulesCore
import UIKit

public class GoogleMaps3DStubView: ExpoView {
  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .clear
  }
}

public class GoogleMaps3DModule: Module {
  public func definition() -> ModuleDefinition {
    Name("GoogleMaps3D")

    View(GoogleMaps3DStubView.self) {
      Events("onMapReady", "onFlyoverProgress", "onFlyoverComplete")
    }
  }
}
