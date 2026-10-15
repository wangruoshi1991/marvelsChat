import AVFoundation
import CoreLocation
import React
import Speech

@objc(MiaoxunConfigModule)
final class MiaoxunConfigModule: NSObject {
  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc
  func constantsToExport() -> [AnyHashable: Any] {
    guard
      let value = Bundle.main.object(forInfoDictionaryKey: "MiaoxunAPIBaseURL") as? String,
      !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    else {
      return ["apiBaseURL": ""]
    }

    return [
      "apiBaseURL": value,
      "bundleIdentifier": Bundle.main.bundleIdentifier ?? "",
      "buildNumber": Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "",
    ]
  }
}

@objc(QRCodeScannerModule)
final class QRCodeScannerModule: NSObject {
  private var resolve: RCTPromiseResolveBlock?
  private var reject: RCTPromiseRejectBlock?

  @objc
  static func requiresMainQueueSetup() -> Bool {
    true
  }

  @objc(scan:rejecter:)
  func scan(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      guard self.resolve == nil && self.reject == nil else {
        reject("scanner_busy", "扫码器正在运行。", nil)
        return
      }

      self.resolve = resolve
      self.reject = reject
      self.requestCameraAccess()
    }
  }

  private func requestCameraAccess() {
    guard AVCaptureDevice.default(for: .video) != nil else {
      finishWithError("camera_unavailable", "当前设备无法打开相机。")
      return
    }

    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized:
      presentScanner()
    case .notDetermined:
      AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
        DispatchQueue.main.async {
          granted ? self?.presentScanner() : self?.finishWithError("camera_denied", "未获得相机权限。")
        }
      }
    case .denied, .restricted:
      finishWithError("camera_denied", "未获得相机权限。")
    @unknown default:
      finishWithError("camera_unavailable", "当前设备无法确认相机权限。")
    }
  }

  private func presentScanner() {
    guard
      let rootViewController = UIApplication.shared.connectedScenes
        .compactMap({ $0 as? UIWindowScene })
        .flatMap({ $0.windows })
        .first(where: { $0.isKeyWindow })?
        .rootViewController
    else {
      finishWithError("present_failed", "无法打开扫码页面。")
      return
    }

    let controller = QRCodeScannerViewController { [weak self] result in
      switch result {
      case .success(let value):
        self?.finishWithValue(value)
      case .failure(let error as QRCodeScannerError):
        if error == .cancelled {
          self?.finishWithError("scanner_cancelled", error.localizedDescription)
        } else {
          self?.finishWithError("scanner_failed", error.localizedDescription)
        }
      case .failure(let error):
        self?.finishWithError("scanner_failed", error.localizedDescription)
      }
    }

    topViewController(from: rootViewController).present(controller, animated: true)
  }

  private func topViewController(from root: UIViewController) -> UIViewController {
    if let presented = root.presentedViewController {
      return topViewController(from: presented)
    }
    if let navigation = root as? UINavigationController, let visible = navigation.visibleViewController {
      return topViewController(from: visible)
    }
    if let tab = root as? UITabBarController, let selected = tab.selectedViewController {
      return topViewController(from: selected)
    }
    return root
  }

  private func finishWithValue(_ value: String) {
    resolve?(value)
    clearCallbacks()
  }

  private func finishWithError(_ code: String, _ message: String) {
    reject?(code, message, nil)
    clearCallbacks()
  }

  private func clearCallbacks() {
    resolve = nil
    reject = nil
  }
}

@objc(MiaoxunLocationModule)
final class MiaoxunLocationModule: NSObject, CLLocationManagerDelegate {
  private let manager = CLLocationManager()
  private var resolve: RCTPromiseResolveBlock?
  private var reject: RCTPromiseRejectBlock?
  private var timeoutWorkItem: DispatchWorkItem?

  override init() {
    super.init()
    manager.delegate = self
    manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
  }

  @objc
  static func requiresMainQueueSetup() -> Bool {
    true
  }

  @objc(currentLocation:rejecter:)
  func currentLocation(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      guard self.resolve == nil && self.reject == nil else {
        reject("location_busy", "定位请求正在进行。", nil)
        return
      }

      self.resolve = resolve
      self.reject = reject
      self.startTimeout()
      self.requestLocation()
    }
  }

  private func startTimeout() {
    timeoutWorkItem?.cancel()
    let workItem = DispatchWorkItem { [weak self] in
      self?.finishWithError("location_timeout", "定位超时。")
    }
    timeoutWorkItem = workItem
    DispatchQueue.main.asyncAfter(deadline: .now() + 15, execute: workItem)
  }

  private func requestLocation() {
    guard CLLocationManager.locationServicesEnabled() else {
      finishWithError("location_disabled", "系统定位服务未开启。")
      return
    }

    switch manager.authorizationStatus {
    case .authorizedWhenInUse, .authorizedAlways:
      manager.requestLocation()
    case .notDetermined:
      manager.requestWhenInUseAuthorization()
    case .denied, .restricted:
      finishWithError("location_denied", "未获得定位权限。")
    @unknown default:
      finishWithError("location_unavailable", "当前设备无法确认定位权限。")
    }
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    guard resolve != nil || reject != nil else {
      return
    }
    switch manager.authorizationStatus {
    case .authorizedWhenInUse, .authorizedAlways:
      manager.requestLocation()
    case .denied, .restricted:
      finishWithError("location_denied", "未获得定位权限。")
    case .notDetermined:
      break
    @unknown default:
      finishWithError("location_unavailable", "当前设备无法确认定位权限。")
    }
  }

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard let location = locations.last else {
      finishWithError("location_unavailable", "没有获取到有效定位。")
      return
    }

    resolve?([
      "latitude": location.coordinate.latitude,
      "longitude": location.coordinate.longitude,
      "horizontalAccuracy": location.horizontalAccuracy,
    ])
    clearCallbacks()
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    finishWithError("location_failed", error.localizedDescription)
  }

  private func finishWithError(_ code: String, _ message: String) {
    reject?(code, message, nil)
    clearCallbacks()
  }

  private func clearCallbacks() {
    timeoutWorkItem?.cancel()
    timeoutWorkItem = nil
    resolve = nil
    reject = nil
  }
}

@objc(MiaoxunSpeechModule)
final class MiaoxunSpeechModule: RCTEventEmitter {
  private let audioEngine = AVAudioEngine()
  private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
  private var recognitionTask: SFSpeechRecognitionTask?
  private var resolve: RCTPromiseResolveBlock?
  private var reject: RCTPromiseRejectBlock?
  private var requestID: String?
  private var permissionID: String?
  private var permissionResolve: RCTPromiseResolveBlock?
  private var permissionReject: RCTPromiseRejectBlock?
  private var bestText = ""
  private var inputTapInstalled = false
  private var timeoutWorkItem: DispatchWorkItem?
  private var hasEventListeners = false

  override static func requiresMainQueueSetup() -> Bool { true }
  override func supportedEvents() -> [String]! { ["MiaoxunSpeechUpdate"] }
  override func startObserving() { hasEventListeners = true }
  override func stopObserving() { hasEventListeners = false }

  @objc(recognize:languageCode:resolver:rejecter:)
  func recognize(
    _ requestID: String,
    languageCode: String?,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
#if targetEnvironment(simulator)
      reject("speech_simulator_unavailable", "模拟器无法稳定使用语音识别，请在 iPhone 真机上测试。", nil)
#else
      guard self.requestID == nil && self.permissionID == nil else {
        reject("speech_busy", "语音识别正在进行。", nil)
        return
      }
      let speechStatus = SFSpeechRecognizer.authorizationStatus()
      let audioStatus = AVAudioSession.sharedInstance().recordPermission
      guard speechStatus != .notDetermined && audioStatus != .undetermined else {
        reject("speech_permission_required", "首次使用请先开启语音权限，再长按说话。", nil)
        return
      }
      guard speechStatus == .authorized && audioStatus == .granted else {
        reject("speech_denied", "未获得语音或麦克风权限，请前往系统设置开启。", nil)
        return
      }
      self.requestID = requestID
      self.resolve = resolve
      self.reject = reject
      self.bestText = ""
      self.emitUpdate("preparing")
      self.startRecognition(languageCode: languageCode, requestID: requestID)
#endif
    }
  }

  @objc(finish:)
  func finish(_ requestID: String) {
    DispatchQueue.main.async {
      guard self.requestID == requestID else { return }
      guard self.recognitionRequest != nil else {
        self.finishWithError("speech_cancelled", "语音输入已取消，请在授权后重新长按。")
        return
      }
      if self.audioEngine.isRunning { self.audioEngine.stop() }
      self.recognitionRequest?.endAudio()
      self.emitUpdate("finishing")
      self.scheduleTimeout(requestID: requestID, seconds: 3)
    }
  }

  @objc(cancel:)
  func cancel(_ requestID: String) {
    DispatchQueue.main.async {
      if self.permissionID == requestID {
        self.finishPermissionError("speech_cancelled", "语音授权已取消。")
      }
      guard self.requestID == requestID else { return }
      self.finishWithError("speech_cancelled", "语音输入已取消。")
    }
  }

  private func emitUpdate(_ state: String) {
    guard hasEventListeners, let requestID else { return }
    sendEvent(withName: "MiaoxunSpeechUpdate", body: ["requestId": requestID, "state": state, "text": bestText])
  }

  // Permission preparation never creates a recognition request or opens the microphone.
  @objc(prepare:resolver:rejecter:)
  func prepare(
    _ permissionID: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
#if targetEnvironment(simulator)
      reject("speech_simulator_unavailable", "模拟器无法稳定使用语音识别，请在 iPhone 真机上测试。", nil)
#else
      guard self.requestID == nil && self.permissionID == nil else {
        reject("speech_busy", "语音识别或授权正在进行。", nil)
        return
      }
      self.permissionID = permissionID
      self.permissionResolve = resolve
      self.permissionReject = reject
      SFSpeechRecognizer.requestAuthorization { [weak self] speechStatus in
        DispatchQueue.main.async {
          guard let self, self.permissionID == permissionID else { return }
          guard speechStatus == .authorized else {
            self.finishPermissionError("speech_denied", "未获得语音识别权限，请前往系统设置开启。")
            return
          }
          AVAudioSession.sharedInstance().requestRecordPermission { granted in
            DispatchQueue.main.async {
              guard self.permissionID == permissionID else { return }
              if granted {
                let completion = self.permissionResolve
                self.clearPermissionState()
                completion?(["ready": true])
              } else {
                self.finishPermissionError("speech_denied", "未获得麦克风权限，请前往系统设置开启。")
              }
            }
          }
        }
      }
#endif
    }
  }

  private func finishPermissionError(_ code: String, _ message: String) {
    let failure = permissionReject
    clearPermissionState()
    failure?(code, message, nil)
  }

  private func clearPermissionState() {
    permissionID = nil
    permissionResolve = nil
    permissionReject = nil
  }

  private func startRecognition(languageCode: String?, requestID: String) {
    guard self.requestID == requestID else { return }
    guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: languageCode == "en" ? "en-US" : "zh-CN")), recognizer.isAvailable else {
      finishWithError("speech_unavailable", "当前设备或语言没有可用的系统语音识别服务。")
      return
    }
    let request = SFSpeechAudioBufferRecognitionRequest()
    recognitionRequest = request
    request.shouldReportPartialResults = true
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(.record, mode: .measurement, options: .duckOthers)
      try session.setActive(true, options: .notifyOthersOnDeactivation)
      let inputNode = audioEngine.inputNode
      let format = inputNode.outputFormat(forBus: 0)
      guard format.sampleRate > 0 && format.channelCount > 0 else {
        finishWithError("speech_audio", "当前设备没有可用的麦克风输入。")
        return
      }
      inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
        request.append(buffer)
      }
      inputTapInstalled = true
      audioEngine.prepare()
      try audioEngine.start()
    } catch {
      finishWithError("speech_audio", "无法打开麦克风。", error)
      return
    }
    emitUpdate("listening")
    recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
      DispatchQueue.main.async {
        guard let self, self.requestID == requestID else { return }
        if let result {
          self.bestText = result.bestTranscription.formattedString
          self.emitUpdate("listening")
          if result.isFinal {
            self.finishWithText(self.bestText)
            return
          }
        }
        if let error {
          self.finishWithError("speech_failed", "系统语音识别中断，请重试或使用键盘。", error)
        }
      }
    }
    scheduleTimeout(requestID: requestID, seconds: 30)
  }

  private func scheduleTimeout(requestID: String, seconds: Double) {
    timeoutWorkItem?.cancel()
    let timeout = DispatchWorkItem { [weak self] in
      guard let self, self.requestID == requestID else { return }
      self.finishWithText(self.bestText)
    }
    timeoutWorkItem = timeout
    DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: timeout)
  }

  private func finishWithText(_ text: String) {
    let cleaned = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !cleaned.isEmpty else {
      finishWithError("speech_empty", "没有识别到有效文字，请重试或使用键盘。")
      return
    }
    let completion = resolve
    clearState()
    completion?(["text": cleaned])
  }

  private func finishWithError(_ code: String, _ message: String, _ error: Error? = nil) {
    let failure = reject
    clearState()
    failure?(code, message, error)
  }

  private func clearState() {
    // Invalidate callbacks before cancelling; an earlier session must never finish a newer one.
    requestID = nil
    resolve = nil
    reject = nil
    timeoutWorkItem?.cancel()
    timeoutWorkItem = nil
    recognitionTask?.cancel()
    recognitionTask = nil
    recognitionRequest?.endAudio()
    recognitionRequest = nil
    if audioEngine.isRunning { audioEngine.stop() }
    if inputTapInstalled {
      audioEngine.inputNode.removeTap(onBus: 0)
      inputTapInstalled = false
    }
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    bestText = ""
  }
}
