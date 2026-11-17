import Photos
import React
import UIKit

@objc(MiaoxunMediaLibraryModule)
final class MiaoxunMediaLibraryModule: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc(saveImage:token:resolver:rejecter:)
  func saveImage(
    _ mediaAssetId: String,
    token: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    save(path: "/api/station/media-assets/\(mediaAssetId)/file", identifier: mediaAssetId, token: token, resolver: resolve, rejecter: reject, idPattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")
  }

  @objc(saveChatImage:token:resolver:rejecter:)
  func saveChatImage(
    _ attachmentId: String,
    token: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    save(path: "/api/chat-attachments/\(attachmentId)/content", identifier: attachmentId, token: token, resolver: resolve, rejecter: reject, idPattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")
  }

  private func save(
    path: String,
    identifier: String,
    token: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock,
    idPattern: String
  ) {
    guard identifier.range(of: idPattern, options: .regularExpression) != nil else {
      reject("comic_media_invalid_id", "图片引用无效，未保存。", nil)
      return
    }
    guard !token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      reject("comic_media_missing_session", "登录状态已失效，请重新登录后再保存。", nil)
      return
    }
    guard
      let origin = Bundle.main.object(forInfoDictionaryKey: "MiaoxunAPIBaseURL") as? String,
      let base = URL(string: origin),
      ["https", "http"].contains(base.scheme ?? ""),
      base.host != nil,
      base.user == nil,
      base.password == nil,
      base.query == nil,
      base.fragment == nil,
      base.path.isEmpty || base.path == "/",
      let url = URL(string: path, relativeTo: base)?.absoluteURL
    else {
      reject("comic_media_save_unavailable", "图片保存配置不可用。", nil)
      return
    }

    var request = URLRequest(url: url, timeoutInterval: 15)
    request.httpMethod = "GET"
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("image/*", forHTTPHeaderField: "Accept")
    let session = URLSession(configuration: .ephemeral, delegate: MediaRedirectGuard(), delegateQueue: nil)
    session.dataTask(with: request) { data, response, error in
      defer { session.finishTasksAndInvalidate() }
      if let error {
        reject("comic_media_download_failed", "图片下载失败，请检查网络后重试。", error)
        return
      }
      guard let httpResponse = response as? HTTPURLResponse, (200...299).contains(httpResponse.statusCode), let data else {
        reject("comic_media_download_failed", "图片下载未确认，请重试。", nil)
        return
      }
      guard let image = UIImage(data: data) else {
        reject("comic_media_invalid_image", "返回内容不是可保存的图片。", nil)
        return
      }
      // PhotoKit may reject the source representation when the private asset is
      // WebP. Normalize it before creating the system-library asset.
      guard
        let jpegData = image.jpegData(compressionQuality: 0.92),
        let normalizedImage = UIImage(data: jpegData)
      else {
        reject("comic_media_invalid_image", "图片无法转换为系统相册支持的格式。", nil)
        return
      }
      PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
        DispatchQueue.main.async {
          guard status == .authorized || status == .limited else {
            reject("comic_media_photo_access_denied", "未获得保存到相册的权限。", nil)
            return
          }
          PHPhotoLibrary.shared().performChanges({
            PHAssetChangeRequest.creationRequestForAsset(from: normalizedImage)
          }) { saved, saveError in
            DispatchQueue.main.async {
              if let saveError {
                reject("comic_media_save_failed", "保存到相册失败，请重试。", saveError)
              } else if saved {
                resolve(["status": "saved", "mediaAssetId": identifier, "attachmentId": identifier])
              } else {
                reject("comic_media_save_unknown", "保存到相册未确认，请检查相册后重试。", nil)
              }
            }
          }
        }
      }
    }.resume()
  }
}

private final class MediaRedirectGuard: NSObject, URLSessionTaskDelegate {
  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) {
    completionHandler(nil)
  }
}
