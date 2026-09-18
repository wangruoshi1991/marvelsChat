import React
import UIKit

@objc(MiaoxunHapticsModule)
final class MiaoxunHapticsModule: NSObject {
  @objc
  static func requiresMainQueueSetup() -> Bool {
    true
  }

  @objc(trigger:)
  func trigger(_ event: String) {
    DispatchQueue.main.async {
      switch event {
      case "activation":
        let generator = UIImpactFeedbackGenerator(style: .medium)
        generator.prepare()
        generator.impactOccurred(intensity: 0.8)
      case "hover":
        let generator = UISelectionFeedbackGenerator()
        generator.prepare()
        generator.selectionChanged()
      case "confirmation":
        let generator = UINotificationFeedbackGenerator()
        generator.prepare()
        generator.notificationOccurred(.success)
      default:
        NSLog("MiaoxunHapticsModule rejected unsupported event: %@", event)
      }
    }
  }
}
