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
    closeButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
    closeButton.backgroundColor = UIColor.black.withAlphaComponent(0.45)
    closeButton.layer.cornerRadius = 18
    closeButton.translatesAutoresizingMaskIntoConstraints = false
    closeButton.addTarget(self, action: #selector(cancel), for: .touchUpInside)
    view.addSubview(closeButton)

    let titleLabel = UILabel()
    titleLabel.text = "扫描妙讯二维码"
    titleLabel.textColor = .white
    titleLabel.font = .systemFont(ofSize: 18, weight: .semibold)
    titleLabel.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(titleLabel)

    let scanBox = UIView()
    scanBox.layer.borderColor = UIColor.white.cgColor
    scanBox.layer.borderWidth = 2
    scanBox.layer.cornerRadius = 18
    scanBox.backgroundColor = UIColor.clear
    scanBox.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(scanBox)

    NSLayoutConstraint.activate([
      closeButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 14),
      closeButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 18),
      closeButton.widthAnchor.constraint(equalToConstant: 64),
      closeButton.heightAnchor.constraint(equalToConstant: 36),
      titleLabel.centerYAnchor.constraint(equalTo: closeButton.centerYAnchor),
      titleLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      scanBox.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      scanBox.centerYAnchor.constraint(equalTo: view.centerYAnchor),
      scanBox.widthAnchor.constraint(equalTo: view.widthAnchor, multiplier: 0.68),
      scanBox.heightAnchor.constraint(equalTo: scanBox.widthAnchor),
    ])
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
    dismiss(animated: true) { [completion] in
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
