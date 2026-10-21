import React
import UIKit
import UniformTypeIdentifiers

@objc(MiaoxunDocumentPickerModule)
final class MiaoxunDocumentPickerModule: NSObject, UIDocumentPickerDelegate {
  private var resolve: RCTPromiseResolveBlock?
  private var reject: RCTPromiseRejectBlock?
  private var copies: [String: URL] = [:]
  @objc static func requiresMainQueueSetup() -> Bool { true }
  @objc var methodQueue: DispatchQueue { DispatchQueue.main }
  override init() {
    super.init()
    // This module owns this dedicated temporary directory. No keys survive launch.
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("MiaoxunDocuments", isDirectory: true)
    do { if FileManager.default.fileExists(atPath: directory.path) { try FileManager.default.removeItem(at: directory) } }
    catch { NSLog("Miaoxun document temporary cleanup failed") }
  }

  @objc(pick:rejecter:)
  func pick(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      guard self.resolve == nil else { reject("file_picker_busy", "文件选择器正在运行。", nil); return }
      guard let root = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).flatMap({ $0.windows }).first(where: { $0.isKeyWindow })?.rootViewController else {
        reject("file_picker_unavailable", "无法打开文件选择器。", nil); return
      }
      self.resolve = resolve
      self.reject = reject
      let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.data], asCopy: true)
      picker.allowsMultipleSelection = false
      picker.delegate = self
      var presenter = root
      while let presented = presenter.presentedViewController { presenter = presented }
      presenter.present(picker, animated: true)
    }
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { finish(nil) }
  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    guard let source = urls.first else { finish(nil); return }
    let scoped = source.startAccessingSecurityScopedResource()
    defer { if scoped { source.stopAccessingSecurityScopedResource() } }
    var copiedURL: URL?
    do {
      let values = try source.resourceValues(forKeys: [.fileSizeKey, .contentTypeKey, .isRegularFileKey])
      guard values.isRegularFile == true, let size = values.fileSize, size > 0, size <= 262144 else {
        throw NSError(domain: "MiaoxunFile", code: 1, userInfo: [NSLocalizedDescriptionKey: "请选择非空且不超过256KiB的文件。"])
      }
      let key = UUID().uuidString.lowercased()
      let directory = FileManager.default.temporaryDirectory.appendingPathComponent("MiaoxunDocuments", isDirectory: true)
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      let destination = directory.appendingPathComponent(key)
      copiedURL = destination
      try FileManager.default.copyItem(at: source, to: destination)
      try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: destination.path)
      copies[key] = destination
      finish(["uri": destination.absoluteString, "originalFilename": source.lastPathComponent, "mimeType": values.contentType?.preferredMIMEType ?? "application/octet-stream", "byteSize": size, "idempotencyKey": key])
    } catch {
      if let copiedURL {
        do { if FileManager.default.fileExists(atPath: copiedURL.path) { try FileManager.default.removeItem(at: copiedURL) } }
        catch { NSLog("Miaoxun document temporary cleanup failed") }
      }
      let failure = reject
      resolve = nil; reject = nil
      failure?("file_read_failed", error.localizedDescription, error)
    }
  }

  @objc(upload:token:mimeType:filename:resolver:rejecter:)
  func upload(_ key: String, token: String, mimeType: String, filename: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let file = copies[key], let origin = Bundle.main.object(forInfoDictionaryKey: "MiaoxunAPIBaseURL") as? String,
      let base = URL(string: origin), ["https", "http"].contains(base.scheme ?? ""), base.host != nil,
      base.user == nil, base.password == nil, base.query == nil, base.fragment == nil,
      base.path.isEmpty || base.path == "/",
      let url = URL(string: "/api/station/file-assets/upload", relativeTo: base)?.absoluteURL
    else { reject("file_upload_unavailable", "文件上传配置或临时文件不可用。", nil); return }
    var request = URLRequest(url: url, timeoutInterval: 20)
    request.httpMethod = "POST"
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type")
    request.setValue(filename, forHTTPHeaderField: "X-Miaoxun-Filename")
    request.setValue(mimeType, forHTTPHeaderField: "X-Miaoxun-File-Mime")
    request.setValue(key, forHTTPHeaderField: "X-Miaoxun-Idempotency-Key")
    let session = URLSession(configuration: .ephemeral, delegate: UploadRedirectGuard(), delegateQueue: nil)
    session.uploadTask(with: request, fromFile: file) { data, response, error in
      defer { session.finishTasksAndInvalidate() }
      if let error { reject("file_upload_failed", "文件上传未确认，请重试。", error); return }
      guard let response = response as? HTTPURLResponse, let data, let body = String(data: data, encoding: .utf8) else {
        reject("file_upload_unknown", "文件上传未确认，请重试。", nil); return
      }
      resolve(["status": response.statusCode, "body": body])
    }.resume()
  }

  @objc(release:resolver:rejecter:)
  func release(_ key: String, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    guard let file = copies[key] else { resolve(nil); return }
    do { try FileManager.default.removeItem(at: file); copies.removeValue(forKey: key); resolve(nil) }
    catch { reject("file_cleanup_failed", "临时文件清理失败，请重试。", error) }
  }
  private func finish(_ result: Any?) {
    let completion = resolve
    resolve = nil; reject = nil
    completion?(result)
  }
}

// Never forward authorization to a redirected origin or a different endpoint.
private final class UploadRedirectGuard: NSObject, URLSessionTaskDelegate {
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
