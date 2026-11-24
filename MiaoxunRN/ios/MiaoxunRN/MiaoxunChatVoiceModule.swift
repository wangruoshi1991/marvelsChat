import AVFoundation
import React
import UIKit

@objc(MiaoxunChatVoiceModule)
final class MiaoxunChatVoiceModule: NSObject, RCTInvalidating, AVAudioPlayerDelegate, AVAudioRecorderDelegate {
  private var recorder: AVAudioRecorder?
  private var recordingId: String?
  private var recordingFailureId: String?
  private var completedRecordings = Set<String>()
  private var player: AVAudioPlayer?
  private var playback: Playback?
  private let audio = AVAudioSession.sharedInstance()
  private let maximumBytes = 8 * 1024 * 1024

  private final class Playback {
    let id: String
    let resolve: RCTPromiseResolveBlock
    var session: URLSession?
    var recordingId: String?
    var status = 0
    var paused = false
    var waveform: [Double] = []
    private let cancellationLock = NSLock()
    private var didCancel = false

    var cancelled: Bool {
      cancellationLock.lock()
      defer { cancellationLock.unlock() }
      return didCancel
    }

    func cancel() {
      cancellationLock.lock()
      didCancel = true
      cancellationLock.unlock()
    }

    init(id: String, resolve: @escaping RCTPromiseResolveBlock) {
      self.id = id
      self.resolve = resolve
    }
  }

  @objc static func requiresMainQueueSetup() -> Bool { false }

  override init() {
    super.init()
    NotificationCenter.default.addObserver(self, selector: #selector(interruption(_:)), name: AVAudioSession.interruptionNotification, object: audio)
    NotificationCenter.default.addObserver(self, selector: #selector(applicationBackgrounded), name: UIApplication.didEnterBackgroundNotification, object: nil)
  }

  @objc(prepareRecording:rejecter:)
  func prepareRecording(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      if self.hasRecordingPermission {
        resolve(true)
        return
      }
      let reply: (Bool) -> Void = { allowed in
        if allowed {
          resolve(false)
        } else {
          reject("voice_permission_denied", "未获得麦克风权限，请在系统设置中开启。", nil)
        }
      }
      if #available(iOS 17.0, *) {
        AVAudioApplication.requestRecordPermission(completionHandler: reply)
      } else {
        self.audio.requestRecordPermission(reply)
      }
    }
  }

  @objc(startRecording:resolver:rejecter:)
  func startRecording(_ id: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      guard self.isIdentifier(id), self.recordingId == nil,
            !self.completedRecordings.contains(id), self.hasRecordingPermission else {
        reject("voice_recording_unavailable", "现在无法开始录音，请检查麦克风权限。", nil)
        return
      }
      self.endPlayback("stopped")
      do {
        let url = try self.recordingURL(id)
        try self.audio.setCategory(.record, mode: .default)
        try self.audio.setActive(true)
        let recorder = try AVAudioRecorder(url: url, settings: [
          AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
          AVSampleRateKey: 44_100.0,
          AVNumberOfChannelsKey: 1,
          AVEncoderBitRateKey: 48_000,
        ])
        recorder.delegate = self
        guard recorder.prepareToRecord() else { throw self.audioError("无法准备麦克风录音。") }
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: url.path)
        guard recorder.record(forDuration: 60) else { throw self.audioError("无法启动麦克风录音。") }
        self.recorder = recorder
        self.recordingId = id
        self.recordingFailureId = nil
        resolve(nil)
      } catch {
        self.deactivate()
        self.removeRecording(id)
        reject("voice_recording_failed", "无法开始录音，请重试。", error)
      }
    }
  }

  @objc(finishRecording:resolver:rejecter:)
  func finishRecording(_ id: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      guard self.recordingId == id, let recorder = self.recorder else {
        reject("voice_recording_interrupted", "录音已中断，请重新录制。", nil)
        return
      }
      self.recordingId = nil
      self.recorder = nil
      recorder.stop()
      self.deactivate()
      do {
        let url = try self.recordingURL(id)
        let audio = try AVAudioPlayer(contentsOf: url)
        let ms = Int((audio.duration * 1000).rounded())
        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        let bytes = (attributes[.size] as? NSNumber)?.intValue ?? 0
        guard self.recordingFailureId != id, ms >= 350, ms <= 61000,
              bytes > 0, bytes <= self.maximumBytes else {
          throw self.audioError("录音时间太短，请按住再说。")
        }
        self.completedRecordings.insert(id)
        resolve(["uri": url.absoluteString, "durationMs": ms])
      } catch {
        self.removeRecording(id)
        reject("voice_recording_invalid", "录音太短或已中断，请重试。", error)
      }
    }
  }

  @objc(cancelRecording:)
  func cancelRecording(_ id: String) {
    DispatchQueue.main.async {
      if self.recordingId == id { self.discardActiveRecording() }
    }
  }

  @objc(releaseRecording:)
  func releaseRecording(_ id: String) {
    DispatchQueue.main.async {
      if self.recordingId != id {
        if self.playback?.recordingId == id { self.endPlayback("stopped") }
        self.removeRecording(id)
      }
    }
  }

  @objc(playRecording:recordingId:resolver:rejecter:)
  func playRecording(_ id: String, recordingId: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      guard self.isIdentifier(id), self.isIdentifier(recordingId), self.recordingId == nil,
            self.completedRecordings.contains(recordingId),
            let url = try? self.recordingURL(recordingId) else {
        reject("voice_preview_unavailable", "录音尚未完成或已释放，无法试听。", nil)
        return
      }
      self.endPlayback("stopped")
      let playback = Playback(id: id, resolve: resolve)
      playback.recordingId = recordingId
      playback.status = 200
      self.playback = playback
      let maximumBytes = self.maximumBytes
      DispatchQueue.global(qos: .userInitiated).async { [weak self, weak playback] in
        guard let playback, !playback.cancelled else { return }
        let data: Data?
        do {
          let properties = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
          guard properties.isRegularFile == true, properties.isSymbolicLink != true,
                let bytes = properties.fileSize, bytes > 0, bytes <= maximumBytes else {
            throw NSError(domain: "MiaoxunChatVoice", code: 1)
          }
          // Only finishRecording registers this private file. A new recording
          // cannot reuse its identifier before release, so preview reads a
          // completed snapshot rather than a live recorder or an arbitrary URI.
          data = try Data(contentsOf: url)
        } catch {
          data = nil
        }
        DispatchQueue.main.async { [weak self, weak playback] in
          guard let self, let playback, self.playback === playback, !playback.cancelled else { return }
          guard self.completedRecordings.contains(recordingId), let data,
                !data.isEmpty, data.count <= self.maximumBytes else {
            self.endPlayback("failed")
            return
          }
          self.beginPlayback(playback, data: data)
        }
      }
    }
  }

  @objc(playAttachment:attachmentId:token:resolver:rejecter:)
  func playAttachment(_ id: String, attachmentId: String, token: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      guard self.isIdentifier(id), self.isIdentifier(attachmentId), !token.isEmpty, self.recordingId == nil,
            let origin = Bundle.main.object(forInfoDictionaryKey: "MiaoxunAPIBaseURL") as? String,
            let base = URLComponents(string: origin),
            ["https", "http"].contains(base.scheme ?? ""), base.host != nil,
            base.user == nil, base.password == nil, base.query == nil, base.fragment == nil,
            base.path.isEmpty || base.path == "/",
            let baseURL = base.url,
            let url = URL(string: "/api/chat-attachments/\(attachmentId)/content", relativeTo: baseURL)?.absoluteURL else {
        reject("voice_playback_unavailable", "现在无法播放语音。", nil)
        return
      }

      self.endPlayback("stopped")
      let playback = Playback(id: id, resolve: resolve)
      self.playback = playback
      let delegate = VoiceDownload(maximumBytes: self.maximumBytes) { [weak self, weak playback] status, data in
        DispatchQueue.main.async { [weak self, weak playback] in
          guard let self, let playback, self.playback === playback else { return }
          playback.status = status
          guard let data else {
            self.endPlayback("failed")
            return
          }
          self.beginPlayback(playback, data: data)
        }
      }
      var request = URLRequest(url: url, timeoutInterval: 15)
      request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
      request.setValue("audio/mp4", forHTTPHeaderField: "Accept")
      let configuration = URLSessionConfiguration.ephemeral
      configuration.timeoutIntervalForResource = 20
      configuration.httpShouldSetCookies = false
      configuration.httpCookieStorage = nil
      let session = URLSession(configuration: configuration, delegate: delegate, delegateQueue: nil)
      playback.session = session
      session.dataTask(with: request).resume()
    }
  }

  private func beginPlayback(_ playback: Playback, data: Data) {
    guard self.playback === playback, !playback.cancelled else { return }
    do {
      try audio.setCategory(.playback, mode: .spokenAudio)
      try audio.setActive(true)
      let player = try AVAudioPlayer(data: data, fileTypeHint: AVFileType.m4a.rawValue)
      player.delegate = self
      player.enableRate = true
      player.rate = 1
      guard player.prepareToPlay(), player.duration.isFinite, player.duration > 0 else {
        throw audioError("无法准备语音播放。")
      }
      self.player = player
      guard player.play() else { throw audioError("无法开始播放。") }
      DispatchQueue.global(qos: .utility).async { [weak self, weak playback] in
        guard let playback, !playback.cancelled else { return }
        let waveform = Self.decodeWaveform(data, identifier: playback.id) { playback.cancelled }
        DispatchQueue.main.async { [weak self, weak playback] in
          guard let self, let playback, self.playback === playback, !playback.cancelled else { return }
          playback.waveform = waveform
        }
      }
    } catch {
      deactivate()
      endPlayback("failed")
    }
  }

  @objc(getPlaybackState:resolver:rejecter:)
  func getPlaybackState(_ id: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      guard let playback = self.playback, playback.id == id else {
        resolve(["phase": "stopped", "positionMs": 0, "durationMs": 0, "waveform": []] as [String: Any])
        return
      }
      let player = self.player
      let phase = playback.paused ? "paused" : (player?.isPlaying == true ? "playing" : "loading")
      let duration = max(0, player?.duration ?? 0)
      let position = min(duration, max(0, player?.currentTime ?? 0))
      resolve([
        "phase": phase,
        "positionMs": Int((position * 1000).rounded()),
        "durationMs": Int((duration * 1000).rounded()),
        "waveform": playback.waveform,
      ])
    }
  }

  @objc(setPlaybackPaused:paused:resolver:rejecter:)
  func setPlaybackPaused(_ id: String, paused: Bool, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      guard let playback = self.playback, playback.id == id, let player = self.player else {
        resolve(false)
        return
      }
      if playback.paused == paused {
        resolve(paused || player.isPlaying)
        return
      }
      if paused {
        guard player.isPlaying else { resolve(false); return }
        player.pause()
        playback.paused = true
        self.deactivate()
        resolve(true)
      } else {
        do {
          try self.audio.setCategory(.playback, mode: .spokenAudio)
          try self.audio.setActive(true)
          guard player.play() else { throw self.audioError("无法继续播放。") }
          playback.paused = false
          resolve(true)
        } catch {
          self.endPlayback("failed")
          resolve(false)
        }
      }
    }
  }

  @objc(seekPlayback:positionMs:resolver:rejecter:)
  func seekPlayback(_ id: String, positionMs: Double, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      guard positionMs.isFinite, let playback = self.playback, playback.id == id,
            let player = self.player, player.duration.isFinite, player.duration > 0,
            playback.paused || player.isPlaying else {
        resolve(false)
        return
      }
      // Keep a paused seek at the end ready to resume; changing the position
      // must not complete the preview or start playback on its own.
      player.currentTime = min(max(0, player.duration - 0.05), max(0, positionMs / 1000))
      resolve(true)
    }
  }

  @objc(setPlaybackRate:rate:resolver:rejecter:)
  func setPlaybackRate(_ id: String, rate: Double, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      guard [1.0, 1.5, 2.0].contains(rate), let playback = self.playback, playback.id == id,
            let player = self.player, playback.paused || player.isPlaying else {
        resolve(false)
        return
      }
      player.rate = Float(rate)
      resolve(abs(Double(player.rate) - rate) < 0.001)
    }
  }

  @objc(stopPlayback:)
  func stopPlayback(_ id: String) {
    DispatchQueue.main.async {
      if self.playback?.id == id { self.endPlayback("stopped") }
    }
  }

  @objc private func applicationBackgrounded() {
    DispatchQueue.main.async {
      self.discardActiveRecording()
      self.endPlayback("stopped")
    }
  }

  @objc private func interruption(_ notification: Notification) {
    guard let type = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
          type == AVAudioSession.InterruptionType.began.rawValue else { return }
    applicationBackgrounded()
  }

  func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
    DispatchQueue.main.async {
      if self.player === player { self.endPlayback(flag ? "finished" : "failed") }
    }
  }

  func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
    DispatchQueue.main.async {
      if self.recorder === recorder, !flag { self.recordingFailureId = self.recordingId }
      if self.recorder === recorder { self.deactivate() }
    }
  }

  @objc func invalidate() {
    applicationBackgrounded()
    NotificationCenter.default.removeObserver(self)
  }

  private func discardActiveRecording() {
    guard let id = recordingId else { return }
    let active = recorder
    recordingId = nil
    recorder = nil
    active?.stop()
    removeRecording(id)
    deactivate()
  }

  private func endPlayback(_ outcome: String) {
    guard let playback else { return }
    self.playback = nil
    playback.cancel()
    playback.session?.invalidateAndCancel()
    if let player {
      self.player = nil
      player.stop()
      deactivate()
    }
    playback.resolve(["status": playback.status, "outcome": outcome])
  }

  // Decode real PCM amplitudes independently of playback. A missing waveform
  // never prevents a valid recording from playing, and no decoded data survives
  // this playback object. The bounds also cover malformed or unusual media.
  private static func decodeWaveform(_ data: Data, identifier: String, isCancelled: () -> Bool) -> [Double] {
    guard !data.isEmpty, data.count <= 8 * 1024 * 1024, !isCancelled() else { return [] }
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("voice-waveform-\(identifier)-\(UUID().uuidString).m4a")
    defer { try? FileManager.default.removeItem(at: url) }
    do {
      try data.write(to: url, options: [.atomic, .completeFileProtection])
      let file = try AVAudioFile(forReading: url, commonFormat: .pcmFormatFloat32, interleaved: false)
      let format = file.processingFormat
      guard format.sampleRate.isFinite, format.sampleRate > 0, format.sampleRate <= 192_000,
            format.channelCount > 0, format.channelCount <= 8,
            file.length > 0, Double(file.length) / format.sampleRate <= 61,
            let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 4096) else { return [] }
      var peaks = [Double](repeating: 0, count: 32)
      var frameOffset: AVAudioFramePosition = 0
      var decodedBytes = 0
      let deadline = ProcessInfo.processInfo.systemUptime + 5
      while frameOffset < file.length {
        guard !isCancelled(), ProcessInfo.processInfo.systemUptime < deadline else { return [] }
        try file.read(into: buffer, frameCount: 4096)
        let count = Int(buffer.frameLength)
        guard count > 0, let channels = buffer.floatChannelData else { return [] }
        decodedBytes += count * Int(format.channelCount) * MemoryLayout<Float>.size
        guard decodedBytes <= 64 * 1024 * 1024 else { return [] }
        for frame in 0..<count {
          let bin = min(31, Int((frameOffset + AVAudioFramePosition(frame)) * 32 / file.length))
          for channel in 0..<Int(format.channelCount) {
            let sample = Double(channels[channel][frame])
            guard sample.isFinite else { return [] }
            peaks[bin] = max(peaks[bin], abs(sample))
          }
        }
        frameOffset += AVAudioFramePosition(count)
      }
      guard !isCancelled(), let peak = peaks.max(), peak > 0 else {
        return isCancelled() ? [] : peaks
      }
      return peaks.map { min(1, $0 / peak) }
    } catch {
      return []
    }
  }

  private var hasRecordingPermission: Bool {
    if #available(iOS 17.0, *) {
      return AVAudioApplication.shared.recordPermission == .granted
    }
    return audio.recordPermission == .granted
  }

  private func deactivate() {
    try? audio.setActive(false, options: .notifyOthersOnDeactivation)
  }

  private func isIdentifier(_ id: String) -> Bool { UUID(uuidString: id) != nil }

  private func recordingURL(_ id: String) throws -> URL {
    guard isIdentifier(id) else { throw audioError("录音标识无效。") }
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("MiaoxunChatVoice", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    return directory.appendingPathComponent(id).appendingPathExtension("m4a")
  }

  private func removeRecording(_ id: String) {
    completedRecordings.remove(id)
    if let url = try? recordingURL(id) { try? FileManager.default.removeItem(at: url) }
  }

  private func audioError(_ message: String) -> NSError {
    NSError(domain: "MiaoxunChatVoice", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }
}

private final class VoiceDownload: NSObject, URLSessionDataDelegate {
  let maximumBytes: Int
  let completion: (Int, Data?) -> Void
  private var status = 0
  private var data = Data()

  init(maximumBytes: Int, completion: @escaping (Int, Data?) -> Void) {
    self.maximumBytes = maximumBytes
    self.completion = completion
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
    completionHandler(nil)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
    guard let http = response as? HTTPURLResponse else {
      completionHandler(.cancel)
      return
    }
    status = http.statusCode
    let allowed = status == 200 && http.mimeType == "audio/mp4" && http.expectedContentLength <= Int64(maximumBytes)
    completionHandler(allowed ? .allow : .cancel)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive chunk: Data) {
    guard chunk.count <= maximumBytes - data.count else {
      dataTask.cancel()
      return
    }
    data.append(chunk)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    defer { session.finishTasksAndInvalidate() }
    completion(status, error == nil && !data.isEmpty ? data : nil)
  }
}
