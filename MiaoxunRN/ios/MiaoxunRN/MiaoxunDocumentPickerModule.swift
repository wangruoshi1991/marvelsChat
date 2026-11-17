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
      let values = try source.resourceValues(forKeys: [.contentTypeKey, .isRegularFileKey])
      guard values.isRegularFile == true else {
        throw NSError(domain: "MiaoxunFile", code: 1, userInfo: [NSLocalizedDescriptionKey: "请选择非空且不超过256KiB的文件。"])
      }
      let key = UUID().uuidString.lowercased()
      let directory = FileManager.default.temporaryDirectory.appendingPathComponent("MiaoxunDocuments", isDirectory: true)
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      let destination = directory.appendingPathComponent(key)
      copiedURL = destination
      let size = try copyBoundedFile(from: source, to: destination, maximumBytes: 262144)
      guard size > 0 else { throw NSError(domain: "MiaoxunFile", code: 2, userInfo: [NSLocalizedDescriptionKey: "请选择非空文件。"]) }
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

  @objc(uploadChatAttachment:threadId:token:mimeType:encodedFilename:idempotencyKey:resolver:rejecter:)
  func uploadChatAttachment(_ key: String, threadId: String, token: String, mimeType: String, encodedFilename: String, idempotencyKey: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let file = copies[key], let fileSize = try? FileManager.default.attributesOfItem(atPath: file.path)[.size] as? NSNumber,
      fileSize.intValue > 0, fileSize.intValue <= 262144,
      UUID(uuidString: threadId) != nil, UUID(uuidString: idempotencyKey) != nil,
      let origin = Bundle.main.object(forInfoDictionaryKey: "MiaoxunAPIBaseURL") as? String,
      let base = URL(string: origin), ["https", "http"].contains(base.scheme ?? ""), base.host != nil,
      base.user == nil, base.password == nil, base.query == nil, base.fragment == nil,
      base.path.isEmpty || base.path == "/",
      let url = URL(string: "/api/threads/\(threadId)/attachments/upload", relativeTo: base)?.absoluteURL
    else { reject("chat_file_upload_unavailable", "附件上传配置或临时文件不可用。", nil); return }

    var request = URLRequest(url: url, timeoutInterval: 20)
    request.httpMethod = "POST"
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type")
    request.setValue("file", forHTTPHeaderField: "X-Miaoxun-Attachment-Kind")
    request.setValue(mimeType, forHTTPHeaderField: "X-Miaoxun-Attachment-Mime")
    request.setValue(encodedFilename, forHTTPHeaderField: "X-Miaoxun-Filename")
    request.setValue(idempotencyKey, forHTTPHeaderField: "Idempotency-Key")
    request.setValue("mx-\(UUID().uuidString.lowercased())", forHTTPHeaderField: "X-Request-ID")
    if let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String, !build.isEmpty {
      request.setValue(build, forHTTPHeaderField: "X-Miaoxun-App-Build")
    }
    let delegate = BoundedUploadDelegate(maximumResponseBytes: 8192, resolve: resolve, reject: reject)
    let session = URLSession(configuration: .ephemeral, delegate: delegate, delegateQueue: nil)
    delegate.session = session
    session.uploadTask(with: request, fromFile: file).resume()
  }

  @objc(requestBinary:path:token:uri:headers:maximumUploadBytes:maximumResponseBytes:resolver:rejecter:)
  func requestBinary(_ method: String, path: String, token: String, uri: String, headers: NSDictionary?, maximumUploadBytes: NSNumber, maximumResponseBytes: NSNumber, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    var ownedFile: URL?
    do {
      guard method == "GET" || method == "POST" else {
        throw NSError(domain: "MiaoxunBinary", code: 1, userInfo: [NSLocalizedDescriptionKey: "二进制请求方法无效。"])
      }
      guard !token.isEmpty else {
        throw NSError(domain: "MiaoxunBinary", code: 2, userInfo: [NSLocalizedDescriptionKey: "二进制请求缺少登录凭据。"])
      }
      guard let responseLimit = boundedInteger(maximumResponseBytes, maximum: 256 * 1024, allowZero: false) else {
        throw NSError(domain: "MiaoxunBinary", code: 3, userInfo: [NSLocalizedDescriptionKey: "二进制响应大小限制无效。"])
      }
      guard let uploadLimit = boundedInteger(maximumUploadBytes, maximum: 8 * 1024 * 1024, allowZero: true) else {
        throw NSError(domain: "MiaoxunBinary", code: 4, userInfo: [NSLocalizedDescriptionKey: "二进制上传大小限制无效。"])
      }

      let url = try validatedRequestURL(path)
      var request = URLRequest(url: url, timeoutInterval: 20)
      request.httpMethod = method
      try applyRequestHeaders(headers, to: &request)
      request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
      if request.value(forHTTPHeaderField: "X-Request-ID") == nil {
        request.setValue("mx-\(UUID().uuidString.lowercased())", forHTTPHeaderField: "X-Request-ID")
      }

      if method == "POST" {
        guard !uri.isEmpty else {
          throw NSError(domain: "MiaoxunBinary", code: 5, userInfo: [NSLocalizedDescriptionKey: "上传请求缺少本地文件。"])
        }
        ownedFile = try copyOwnedUploadFile(from: uri, maximumBytes: uploadLimit)
        request.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type")
      } else {
        guard uri.isEmpty else {
          throw NSError(domain: "MiaoxunBinary", code: 6, userInfo: [NSLocalizedDescriptionKey: "GET 请求不接受本地文件。"])
        }
      }

      let configuration = URLSessionConfiguration.ephemeral
      configuration.timeoutIntervalForRequest = 20
      configuration.timeoutIntervalForResource = 20
      configuration.httpShouldSetCookies = false
      configuration.httpCookieAcceptPolicy = .never
      configuration.httpCookieStorage = nil
      let delegate = BoundedUploadDelegate(
        maximumResponseBytes: responseLimit,
        resolve: resolve,
        reject: reject,
        operationCode: "binary_request",
        cleanupFile: ownedFile,
      )
      let session = URLSession(configuration: configuration, delegate: delegate, delegateQueue: nil)
      delegate.session = session
      if let ownedFile {
        session.uploadTask(with: request, fromFile: ownedFile).resume()
      } else {
        session.dataTask(with: request).resume()
      }
    } catch {
      if let ownedFile {
        try? FileManager.default.removeItem(at: ownedFile)
      }
      reject("binary_request_invalid", error.localizedDescription, error)
    }
  }

  private func boundedInteger(_ value: NSNumber, maximum: Int, allowZero: Bool) -> Int? {
    let number = value.doubleValue
    guard number.isFinite, number.rounded() == number,
          number >= (allowZero ? 0 : 1), number <= Double(maximum) else { return nil }
    return Int(number)
  }

  private func validatedOrigin() throws -> URL {
    guard let origin = Bundle.main.object(forInfoDictionaryKey: "MiaoxunAPIBaseURL") as? String,
          let base = URL(string: origin), ["https", "http"].contains(base.scheme ?? ""),
          base.host != nil, base.user == nil, base.password == nil,
          base.query == nil, base.fragment == nil, base.path.isEmpty || base.path == "/" else {
      throw NSError(domain: "MiaoxunBinary", code: 7, userInfo: [NSLocalizedDescriptionKey: "二进制请求配置无效。"])
    }
    return base
  }

  private func validatedRequestURL(_ path: String) throws -> URL {
    guard path.hasPrefix("/api/"), !path.contains("\\"),
          let components = URLComponents(string: path), components.scheme == nil,
          components.host == nil, components.user == nil, components.password == nil,
          components.query == nil, components.fragment == nil else {
      throw NSError(domain: "MiaoxunBinary", code: 8, userInfo: [NSLocalizedDescriptionKey: "二进制请求路径无效。"])
    }
    let decodedPath = components.path.removingPercentEncoding ?? components.path
    let segments = decodedPath.split(separator: "/", omittingEmptySubsequences: false)
    guard !segments.contains(where: { $0 == "." || $0 == ".." }) else {
      throw NSError(domain: "MiaoxunBinary", code: 9, userInfo: [NSLocalizedDescriptionKey: "二进制请求路径无效。"])
    }
    let base = try validatedOrigin()
    guard let url = URL(string: path, relativeTo: base)?.absoluteURL,
          url.scheme == base.scheme, url.host == base.host, url.port == base.port else {
      throw NSError(domain: "MiaoxunBinary", code: 10, userInfo: [NSLocalizedDescriptionKey: "二进制请求路径超出当前服务。"])
    }
    return url
  }

  private func applyRequestHeaders(_ headers: NSDictionary?, to request: inout URLRequest) throws {
    guard let headers else { return }
    for (rawKey, rawValue) in headers {
      guard let key = rawKey as? String, let value = rawValue as? String,
            !key.isEmpty, key.rangeOfCharacter(from: .controlCharacters) == nil,
            value.rangeOfCharacter(from: .controlCharacters) == nil else {
        throw NSError(domain: "MiaoxunBinary", code: 11, userInfo: [NSLocalizedDescriptionKey: "二进制请求标头无效。"])
      }
      let normalized = key.lowercased()
      guard normalized != "host", normalized != "authorization" else {
        throw NSError(domain: "MiaoxunBinary", code: 12, userInfo: [NSLocalizedDescriptionKey: "二进制请求不允许覆盖安全标头。"])
      }
      request.setValue(value, forHTTPHeaderField: key)
    }
  }

  private func copyOwnedUploadFile(from uri: String, maximumBytes: Int) throws -> URL {
    guard maximumBytes > 0, let source = URL(string: uri), source.isFileURL,
          source.host == nil, source.query == nil, source.fragment == nil,
          !source.path.isEmpty else {
      throw NSError(domain: "MiaoxunBinary", code: 13, userInfo: [NSLocalizedDescriptionKey: "仅支持本地文件图片。"])
    }
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("MiaoxunDocuments", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let destination = directory.appendingPathComponent("request-\(UUID().uuidString.lowercased())")
    let scoped = source.startAccessingSecurityScopedResource()
    defer { if scoped { source.stopAccessingSecurityScopedResource() } }
    do {
      let size = try copyBoundedFile(from: source, to: destination, maximumBytes: maximumBytes, limitMessage: "本地文件超出上传限制。")
      guard size > 0 else {
        throw NSError(domain: "MiaoxunBinary", code: 14, userInfo: [NSLocalizedDescriptionKey: "本地文件为空。"])
      }
      try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: destination.path)
      return destination
    } catch {
      try? FileManager.default.removeItem(at: destination)
      throw error
    }
  }

  private func copyBoundedFile(from source: URL, to destination: URL, maximumBytes: Int, limitMessage: String = "请选择不超过256KiB的文件。") throws -> Int {
    guard FileManager.default.createFile(atPath: destination.path, contents: nil) else {
      throw NSError(domain: "MiaoxunFile", code: 3, userInfo: [NSLocalizedDescriptionKey: "无法创建临时文件。"])
    }
    let input = try FileHandle(forReadingFrom: source)
    let output = try FileHandle(forWritingTo: destination)
    defer { try? input.close(); try? output.close() }
    var total = 0
    while true {
      let chunk = try input.read(upToCount: 16 * 1024) ?? Data()
      if chunk.isEmpty { return total }
      guard total <= maximumBytes - chunk.count else {
        throw NSError(domain: "MiaoxunFile", code: 4, userInfo: [NSLocalizedDescriptionKey: limitMessage])
      }
      try output.write(contentsOf: chunk)
      total += chunk.count
    }
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

private final class BoundedUploadDelegate: NSObject, URLSessionDataDelegate, URLSessionTaskDelegate {
  private let maximumResponseBytes: Int
  private let resolve: RCTPromiseResolveBlock
  private let reject: RCTPromiseRejectBlock
  private let operationCode: String
  private let cleanupFile: URL?
  private var response: HTTPURLResponse?
  private var body = Data()
  private var exceededLimit = false
  private var redirected = false
  weak var session: URLSession?

  init(maximumResponseBytes: Int, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock, operationCode: String = "chat_file_upload", cleanupFile: URL? = nil) {
    self.maximumResponseBytes = maximumResponseBytes
    self.resolve = resolve
    self.reject = reject
    self.operationCode = operationCode
    self.cleanupFile = cleanupFile
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
    self.response = response as? HTTPURLResponse
    if response.expectedContentLength > Int64(maximumResponseBytes) {
      exceededLimit = true
      completionHandler(.cancel)
      return
    }
    completionHandler(.allow)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    guard body.count <= maximumResponseBytes - data.count else {
      exceededLimit = true
      dataTask.cancel()
      return
    }
    body.append(data)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
    redirected = true
    completionHandler(nil)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    defer {
      if let cleanupFile { try? FileManager.default.removeItem(at: cleanupFile) }
      session.finishTasksAndInvalidate()
    }
    if redirected {
      reject(operationCode == "chat_file_upload" ? "chat_file_upload_failed" : "binary_request_redirected", operationCode == "chat_file_upload" ? "附件上传未确认，请重试。" : "请求被重定向，已停止以保护登录信息。", nil)
      return
    }
    if exceededLimit {
      reject(operationCode == "chat_file_upload" ? "chat_file_upload_unknown" : "binary_request_response_too_large", operationCode == "chat_file_upload" ? "附件上传结果超出限制，无法确认。" : "响应大小超出限制，无法确认。", nil)
      return
    }
    if let error {
      reject(operationCode == "chat_file_upload" ? "chat_file_upload_failed" : "binary_request_failed", operationCode == "chat_file_upload" ? "附件上传未确认，请重试。" : "二进制请求未确认，请重试。", error)
      return
    }
    guard let response, let text = String(data: body, encoding: .utf8) else {
      reject(operationCode == "chat_file_upload" ? "chat_file_upload_unknown" : "binary_request_invalid_response", operationCode == "chat_file_upload" ? "附件上传结果无法确认，请重试。" : "二进制响应无法确认，请重试。", nil)
      return
    }
    if operationCode == "chat_file_upload" {
      resolve(["status": response.statusCode, "body": text])
      return
    }
    var result: [String: Any] = ["status": response.statusCode, "body": text]
    if let requestId = response.value(forHTTPHeaderField: "X-Request-ID") {
      result["requestId"] = requestId
    }
    resolve(result)
  }
}
