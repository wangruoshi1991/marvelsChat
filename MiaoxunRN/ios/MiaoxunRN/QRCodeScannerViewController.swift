import AVFoundation
import UIKit

final class QRCodeScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
  private let session = AVCaptureSession()
  private let sessionQueue = DispatchQueue(label: "com.gary.miaoxun.qrscanner.session", qos: .userInitiated)
  private let completion: (Result<String, Error>) -> Void
  private var previewLayer: AVCaptureVideoPreviewLayer?
  private var didFinish = false
  private var hasAppeared = false
  private var pendingResult: Result<String, Error>?

  init(completion: @escaping (Result<String, Error>) -> Void) {
    self.completion = completion
    super.init(nibName: nil, bundle: nil)
    modalPresentationStyle = .fullScreen
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
    configureCaptureSession()
    configureOverlay()
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    previewLayer?.frame = view.bounds
    guard let connection = previewLayer?.connection else { return }
    let orientation = view.window?.windowScene?.interfaceOrientation ?? .portrait
    let rotation: CGFloat
    switch orientation {
    case .landscapeLeft: rotation = 0
    case .landscapeRight: rotation = 180
    case .portraitUpsideDown: rotation = 270
    default: rotation = 90
    }
    if #available(iOS 17.0, *) {
      if connection.isVideoRotationAngleSupported(rotation) {
        connection.videoRotationAngle = rotation
      }
    } else if connection.isVideoOrientationSupported {
      connection.videoOrientation = AVCaptureVideoOrientation(rawValue: orientation.rawValue) ?? .portrait
    }
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    sessionQueue.async { [weak self] in
      guard let self, !self.session.isRunning else {
        return
      }
      self.session.startRunning()
    }
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    hasAppeared = true
    if let result = pendingResult {
      pendingResult = nil
      dismissAndComplete(result)
    }
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    sessionQueue.async { [weak self] in
      guard let self, self.session.isRunning else {
        return
      }
      self.session.stopRunning()
    }
  }

  private func configureCaptureSession() {
    guard let device = AVCaptureDevice.default(for: .video) else {
      finish(.failure(QRCodeScannerError.cameraUnavailable))
      return
    }

    do {
      let input = try AVCaptureDeviceInput(device: device)
      guard session.canAddInput(input) else {
        finish(.failure(QRCodeScannerError.cameraUnavailable))
        return
      }
      session.addInput(input)
    } catch {
      finish(.failure(error))
      return
    }

    let output = AVCaptureMetadataOutput()
    guard session.canAddOutput(output) else {
      finish(.failure(QRCodeScannerError.metadataOutputUnavailable))
      return
    }
    session.addOutput(output)
    output.setMetadataObjectsDelegate(self, queue: DispatchQueue.main)
    output.metadataObjectTypes = [.qr]

    let layer = AVCaptureVideoPreviewLayer(session: session)
    layer.videoGravity = .resizeAspectFill
    layer.frame = view.bounds
    view.layer.insertSublayer(layer, at: 0)
    previewLayer = layer
  }

  private func configureOverlay() {
    let closeButton = UIButton(type: .system)
    closeButton.setTitle("关闭", for: .normal)
    closeButton.setTitleColor(.white, for: .normal)
    closeButton.titleLabel?.font = .preferredFont(forTextStyle: .subheadline)
    closeButton.titleLabel?.adjustsFontForContentSizeCategory = true
    closeButton.backgroundColor = UIColor.black.withAlphaComponent(0.78)
    closeButton.layer.cornerRadius = 22
    closeButton.translatesAutoresizingMaskIntoConstraints = false
    closeButton.addTarget(self, action: #selector(cancel), for: .touchUpInside)
    view.addSubview(closeButton)

    let hintLabel = UILabel()
    hintLabel.text = "将镜头对准妙讯身份码"
    hintLabel.textColor = .white
    hintLabel.font = .preferredFont(forTextStyle: .body)
    hintLabel.adjustsFontForContentSizeCategory = true
    hintLabel.textAlignment = .center
    hintLabel.numberOfLines = 0
    hintLabel.translatesAutoresizingMaskIntoConstraints = false

    let hintBackground = UIView()
    hintBackground.backgroundColor = UIColor.black.withAlphaComponent(0.78)
    hintBackground.layer.cornerRadius = 20
    hintBackground.translatesAutoresizingMaskIntoConstraints = false
    hintBackground.addSubview(hintLabel)
    view.addSubview(hintBackground)

    let safeArea = view.safeAreaLayoutGuide
    NSLayoutConstraint.activate([
      closeButton.topAnchor.constraint(equalTo: safeArea.topAnchor, constant: 12),
      closeButton.leadingAnchor.constraint(equalTo: safeArea.leadingAnchor, constant: 16),
      closeButton.widthAnchor.constraint(greaterThanOrEqualToConstant: 68),
      closeButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
      hintBackground.centerXAnchor.constraint(equalTo: safeArea.centerXAnchor),
      hintBackground.leadingAnchor.constraint(greaterThanOrEqualTo: safeArea.leadingAnchor, constant: 16),
      hintBackground.trailingAnchor.constraint(lessThanOrEqualTo: safeArea.trailingAnchor, constant: -16),
      hintBackground.bottomAnchor.constraint(equalTo: safeArea.bottomAnchor, constant: -24),
      hintLabel.topAnchor.constraint(equalTo: hintBackground.topAnchor, constant: 10),
      hintLabel.bottomAnchor.constraint(equalTo: hintBackground.bottomAnchor, constant: -10),
      hintLabel.leadingAnchor.constraint(equalTo: hintBackground.leadingAnchor, constant: 18),
      hintLabel.trailingAnchor.constraint(equalTo: hintBackground.trailingAnchor, constant: -18),
    ])
  }

  override func accessibilityPerformEscape() -> Bool {
    cancel()
    return true
  }

  @objc private func cancel() {
    finish(.failure(QRCodeScannerError.cancelled))
  }

  func metadataOutput(
    _ output: AVCaptureMetadataOutput,
    didOutput metadataObjects: [AVMetadataObject],
    from connection: AVCaptureConnection
  ) {
    guard
      let metadata = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
      metadata.type == .qr,
      let value = metadata.stringValue,
      !value.isEmpty
    else {
      return
    }
    finish(.success(value))
  }

  private func finish(_ result: Result<String, Error>) {
    guard !didFinish else { return }
    didFinish = true
    sessionQueue.async { [weak self] in
      guard let self, self.session.isRunning else {
        return
      }
      self.session.stopRunning()
    }

    guard hasAppeared, presentingViewController != nil else {
      pendingResult = result
      return
    }

    dismissAndComplete(result)
  }

  private func dismissAndComplete(_ result: Result<String, Error>) {
    dismiss(animated: !UIAccessibility.isReduceMotionEnabled) { [completion] in
      completion(result)
    }
  }
}

enum QRCodeScannerError: LocalizedError {
  case cameraUnavailable
  case metadataOutputUnavailable
  case cancelled

  var errorDescription: String? {
    switch self {
    case .cameraUnavailable:
      return "当前设备无法打开相机。"
    case .metadataOutputUnavailable:
      return "当前设备无法读取二维码。"
    case .cancelled:
      return "已取消扫码。"
    }
  }
}
