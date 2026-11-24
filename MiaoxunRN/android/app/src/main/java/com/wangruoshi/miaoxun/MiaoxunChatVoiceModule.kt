package com.wangruoshi.miaoxun

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaMetadataRetriever
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.media.PlaybackParams
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

class MiaoxunChatVoiceModule(
  private val context: ReactApplicationContext,
) : ReactContextBaseJavaModule(context), LifecycleEventListener {
  private val handler = Handler(Looper.getMainLooper())
  private val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private val audioAttributes = AudioAttributes.Builder()
    .setUsage(AudioAttributes.USAGE_MEDIA)
    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
    .build()
  private var audioFocusListener: AudioManager.OnAudioFocusChangeListener? = null
  private var audioFocusOwner: Any? = null
  private var audioFocusRequest: AudioFocusRequest? = null
  private var focused = false
  private var recording: Recording? = null
  private val completedRecordingIds = mutableSetOf<String>()
  private var playback: Playback? = null
  private var player: MediaPlayer? = null

  private data class Recording(val id: String, val recorder: MediaRecorder)

  private class PendingSeek(val positionMs: Int, var promise: Promise?) {
    fun complete(accepted: Boolean) {
      val pending = promise
      promise = null
      pending?.resolve(accepted)
    }
  }

  private class Playback(val id: String, val promise: Promise, val recordingId: String? = null) {
    @Volatile var cancelled = false
    @Volatile var connection: HttpURLConnection? = null
    var file: File? = null
    var status = 0
    var prepared = false
    var paused = false
    var rate = 1f
    var seekInFlight: PendingSeek? = null
    var queuedSeek: PendingSeek? = null
    var seekTimeout: Runnable? = null
    var waveform: List<Double> = emptyList()
  }

  init {
    context.addLifecycleEventListener(this)
  }

  override fun getName() = "MiaoxunChatVoiceModule"

  @ReactMethod
  fun startRecording(id: String, promise: Promise) {
    handler.post {
      if (!isIdentifier(id) || recording != null || completedRecordingIds.contains(id) ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED
      ) {
        promise.reject("voice_recording_unavailable", "现在无法开始录音，请检查麦克风权限。")
        return@post
      }
      endPlayback("stopped")
      var recorder: MediaRecorder? = null
      try {
        val output = recordingFile(id)
        val next = newRecorder()
        recorder = next
        next.setAudioSource(MediaRecorder.AudioSource.MIC)
        next.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
        next.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
        next.setAudioChannels(1)
        next.setAudioSamplingRate(44_100)
        next.setAudioEncodingBitRate(48_000)
        next.setOutputFile(output.path)
        // The React Native timer normally finalizes at 59.75 seconds.
        // This platform limit releases the microphone even if JS stalls.
        next.setMaxDuration(60_500)
        next.setOnInfoListener { _, what, _ ->
          if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED) {
            handler.post {
              if (recording?.id == id) discardRecording()
            }
          }
        }
        next.setOnErrorListener { _, _, _ ->
          handler.post {
            if (recording?.id == id) discardRecording()
          }
        }
        next.prepare()
        next.start()
        recording = Recording(id, next)
        promise.resolve(null)
      } catch (error: Exception) {
        recorder?.release()
        recordingFile(id).delete()
        promise.reject("voice_recording_failed", "无法开始录音，请重试。", error)
      }
    }
  }

  @ReactMethod
  fun finishRecording(id: String, promise: Promise) {
    handler.post {
      val active = recording
      if (active?.id != id) {
        promise.reject("voice_recording_interrupted", "录音已中断，请重新录制。")
        return@post
      }
      recording = null
      val file = recordingFile(id)
      try {
        active.recorder.stop()
        val retriever = MediaMetadataRetriever()
        val duration = try {
          retriever.setDataSource(file.path)
          retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toInt() ?: 0
        } finally {
          retriever.release()
        }
        check(duration in 350..61_000 && file.length() in 1..MAX_BYTES.toLong())
        completedRecordingIds.add(id)
        promise.resolve(Arguments.createMap().apply {
          putString("uri", Uri.fromFile(file).toString())
          putInt("durationMs", duration)
        })
      } catch (error: Exception) {
        file.delete()
        promise.reject("voice_recording_invalid", "录音太短或已中断，请重试。", error)
      } finally {
        active.recorder.release()
      }
    }
  }

  @ReactMethod
  fun cancelRecording(id: String) {
    handler.post { if (recording?.id == id) discardRecording() }
  }

  @ReactMethod
  fun releaseRecording(id: String) {
    handler.post {
      if (!isIdentifier(id) || recording?.id == id) return@post
      if (playback?.recordingId == id) endPlayback("stopped")
      if (completedRecordingIds.remove(id)) recordingFile(id).delete()
    }
  }

  @ReactMethod
  fun playRecording(id: String, recordingId: String, promise: Promise) {
    handler.post {
      if (!isIdentifier(id) || !isIdentifier(recordingId) || recording != null ||
        !completedRecordingIds.contains(recordingId)
      ) {
        promise.reject("voice_playback_unavailable", "录音已失效，请重新录制。")
        return@post
      }
      val file = recordingFile(recordingId)
      if (!file.isFile || !file.canRead() || file.length() !in 1..MAX_BYTES.toLong()) {
        promise.reject("voice_playback_unavailable", "录音已失效，请重新录制。")
        return@post
      }
      endPlayback("stopped")
      val next = Playback(id, promise, recordingId).apply {
        status = 200
        this.file = file
      }
      playback = next
      beginPlayback(next, file)
    }
  }

  @ReactMethod
  fun playAttachment(id: String, attachmentId: String, token: String, promise: Promise) {
    handler.post {
      if (!isIdentifier(id) || !isIdentifier(attachmentId) || token.isBlank() || recording != null) {
        promise.reject("voice_playback_unavailable", "现在无法播放语音。")
        return@post
      }
      endPlayback("stopped")
      val next = Playback(id, promise)
      playback = next
      Thread { download(next, attachmentId, token) }.start()
    }
  }

  private fun download(next: Playback, attachmentId: String, token: String) {
    var output: File? = null
    var status = 0
    var completed = false
    try {
      val base = URI(BuildConfig.MIAOXUN_API_BASE_URL)
      check(base.scheme in setOf("http", "https") && base.host != null &&
        base.userInfo == null && base.query == null && base.fragment == null &&
        base.path in setOf("", "/"))
      val uri = base.resolve("/api/chat-attachments/$attachmentId/content")
      val connection = (uri.toURL().openConnection() as HttpURLConnection).apply {
        requestMethod = "GET"
        connectTimeout = 15_000
        readTimeout = 15_000
        instanceFollowRedirects = false
        useCaches = false
        setRequestProperty("Authorization", "Bearer $token")
        setRequestProperty("Accept", "audio/mp4")
        setRequestProperty("Cookie", "")
      }
      next.connection = connection
      if (next.cancelled) return
      status = connection.responseCode
      if (status == 200 &&
        connection.contentType?.substringBefore(';') == "audio/mp4" &&
        connection.contentLength <= MAX_BYTES
      ) {
        val file = File.createTempFile("play-", ".m4a", voiceDirectory())
        output = file
        connection.inputStream.use { input ->
          file.outputStream().use { target ->
            val buffer = ByteArray(8192)
            var total = 0
            while (!next.cancelled) {
              val count = input.read(buffer)
              if (count < 0) break
              total += count
              check(total <= MAX_BYTES)
              target.write(buffer, 0, count)
            }
            completed = !next.cancelled && total > 0
          }
        }
      }
    } catch (_: Exception) {
      completed = false
    } finally {
      next.connection?.disconnect()
      next.connection = null
      val file = output
      handler.post {
        if (playback !== next || !completed || file == null) {
          file?.delete()
          if (playback === next) {
            next.status = status
            endPlayback("failed")
          }
        } else {
          next.status = status
          next.file = file
          beginPlayback(next, file)
        }
      }
    }
  }

  // This optional analysis runs off the main thread and uses decoded PCM,
  // never compressed file bytes or generated amplitudes. Cancellation and
  // resource limits cannot change the independent player's success outcome.
  private fun decodeWaveform(next: Playback, file: File): List<Double> {
    if (next.cancelled || file.length() !in 1..MAX_BYTES.toLong()) return emptyList()
    val extractor = MediaExtractor()
    var decoder: MediaCodec? = null
    try {
      extractor.setDataSource(file.path)
      val track = (0 until extractor.trackCount).firstOrNull {
        extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
      } ?: return emptyList()
      val format = extractor.getTrackFormat(track)
      val mime = format.getString(MediaFormat.KEY_MIME) ?: return emptyList()
      val durationUs = format.getLong(MediaFormat.KEY_DURATION)
      if (durationUs !in 1..61_000_000L) return emptyList()
      extractor.selectTrack(track)
      val codec = MediaCodec.createDecoderByType(mime)
      decoder = codec
      format.setInteger(MediaFormat.KEY_PCM_ENCODING, AudioFormat.ENCODING_PCM_16BIT)
      codec.configure(format, null, null, 0)
      codec.start()
      var sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
      var channelCount = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
      var encoding = AudioFormat.ENCODING_PCM_16BIT
      var inputEnded = false
      var outputEnded = false
      var encodedBytes = 0L
      var decodedBytes = 0L
      var sampledFrames = 0L
      val deadline = SystemClock.elapsedRealtime() + 5_000
      val peaks = DoubleArray(32)
      val info = MediaCodec.BufferInfo()
      while (!outputEnded && !next.cancelled && SystemClock.elapsedRealtime() < deadline) {
        if (!inputEnded) {
          val index = codec.dequeueInputBuffer(10_000)
          if (index >= 0) {
            val input = codec.getInputBuffer(index) ?: return emptyList()
            input.clear()
            val size = extractor.readSampleData(input, 0)
            if (size < 0) {
              codec.queueInputBuffer(index, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
              inputEnded = true
            } else {
              encodedBytes += size
              if (encodedBytes > MAX_BYTES) return emptyList()
              codec.queueInputBuffer(index, 0, size, max(0, extractor.sampleTime), 0)
              extractor.advance()
            }
          }
        }
        when (val index = codec.dequeueOutputBuffer(info, 10_000)) {
          MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
            val output = codec.outputFormat
            sampleRate = output.getInteger(MediaFormat.KEY_SAMPLE_RATE)
            channelCount = output.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
            encoding = if (output.containsKey(MediaFormat.KEY_PCM_ENCODING)) {
              output.getInteger(MediaFormat.KEY_PCM_ENCODING)
            } else AudioFormat.ENCODING_PCM_16BIT
          }
          else -> if (index >= 0) {
            try {
              if (sampleRate !in 1..192_000 || channelCount !in 1..8) return emptyList()
              val bytesPerSample = when (encoding) {
                AudioFormat.ENCODING_PCM_16BIT -> 2
                AudioFormat.ENCODING_PCM_FLOAT -> 4
                else -> return emptyList()
              }
              decodedBytes += info.size
              if (decodedBytes > 64L * 1024 * 1024) return emptyList()
              if (info.size > 0 && info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG == 0) {
                val output = codec.getOutputBuffer(index) ?: return emptyList()
                output.position(info.offset)
                output.limit(info.offset + info.size)
                output.order(ByteOrder.LITTLE_ENDIAN)
                val frames = info.size / (bytesPerSample * channelCount)
                sampledFrames += frames
                for (frame in 0 until frames) {
                  if (frame % 4096 == 0 && (next.cancelled || SystemClock.elapsedRealtime() >= deadline)) return emptyList()
                  val timestamp = max(0, info.presentationTimeUs + frame * 1_000_000L / sampleRate)
                  val bin = min(31, (timestamp * 32 / durationUs).toInt())
                  for (channel in 0 until channelCount) {
                    val sample = if (encoding == AudioFormat.ENCODING_PCM_FLOAT) {
                      output.float.toDouble()
                    } else output.short.toDouble() / 32768
                    if (!sample.isFinite()) return emptyList()
                    peaks[bin] = max(peaks[bin], abs(sample))
                  }
                }
              }
              outputEnded = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
            } finally {
              codec.releaseOutputBuffer(index, false)
            }
          }
        }
      }
      if (!outputEnded || next.cancelled || sampledFrames == 0L) return emptyList()
      val maximum = peaks.maxOrNull() ?: return emptyList()
      return peaks.map { if (maximum > 0) min(1.0, it / maximum) else 0.0 }
    } catch (_: Exception) {
      return emptyList()
    } finally {
      decoder?.let {
        runCatching { it.stop() }
        runCatching { it.release() }
      }
      runCatching { extractor.release() }
    }
  }

  private fun beginPlayback(next: Playback, file: File) {
    try {
      val nextPlayer = MediaPlayer()
      player = nextPlayer
      nextPlayer.setAudioAttributes(audioAttributes)
      nextPlayer.setDataSource(file.path)
      nextPlayer.setOnCompletionListener {
        if (playback === next && player === nextPlayer) endPlayback("finished")
      }
      nextPlayer.setOnErrorListener { _, _, _ ->
        if (playback === next && player === nextPlayer) endPlayback("failed")
        true
      }
      nextPlayer.setOnSeekCompleteListener {
        if (playback === next && player === nextPlayer) completeSeek(next, nextPlayer)
      }
      nextPlayer.setOnPreparedListener {
        if (playback === next && player === nextPlayer) {
          try {
            check(requestFocus(next))
            nextPlayer.start()
            next.prepared = true
          } catch (_: Exception) {
            endPlayback("failed")
          }
        }
      }
      nextPlayer.prepareAsync()
      Thread {
        val waveform = runCatching { decodeWaveform(next, file) }.getOrDefault(emptyList())
        handler.post {
          if (playback === next && !next.cancelled) next.waveform = waveform
        }
      }.start()
    } catch (_: Exception) {
      endPlayback("failed")
    }
  }

  @ReactMethod
  fun getPlaybackState(id: String, promise: Promise) {
    handler.post {
      val active = playback?.takeIf { it.id == id }
      val currentPlayer = player?.takeIf { active?.prepared == true }
      val snapshot = try {
        val duration = max(0, currentPlayer?.duration ?: 0)
        val pendingPosition = active?.queuedSeek?.positionMs ?: active?.seekInFlight?.positionMs
        val position = min(duration, max(0, pendingPosition ?: currentPlayer?.currentPosition ?: 0))
        val phase = when {
          active == null -> "stopped"
          active.paused -> "paused"
          currentPlayer?.isPlaying == true -> "playing"
          else -> "loading"
        }
        Arguments.createMap().apply {
          putString("phase", phase)
          putInt("positionMs", position)
          putInt("durationMs", duration)
          putArray("waveform", Arguments.createArray().apply {
            active?.waveform?.forEach { pushDouble(it) }
          })
        }
      } catch (_: IllegalStateException) {
        Arguments.createMap().apply {
          putString("phase", "stopped")
          putInt("positionMs", 0)
          putInt("durationMs", 0)
          putArray("waveform", Arguments.createArray())
        }
      }
      promise.resolve(snapshot)
    }
  }

  @ReactMethod
  fun setPlaybackPaused(id: String, paused: Boolean, promise: Promise) {
    handler.post {
      val active = playback
      val currentPlayer = player
      if (active == null || active.id != id || !active.prepared || currentPlayer == null) {
        promise.resolve(false)
        return@post
      }
      try {
        if (active.paused == paused) {
          promise.resolve(paused || currentPlayer.isPlaying)
          return@post
        }
        if (paused) {
          if (!currentPlayer.isPlaying) {
            promise.resolve(false)
            return@post
          }
          currentPlayer.pause()
          active.paused = true
          if (focused) abandonFocus()
        } else {
          check(requestFocus(active))
          // PlaybackParams may start paused audio. Apply only after explicit
          // resume and after granting this playback instance audio focus.
          currentPlayer.playbackParams = PlaybackParams().setSpeed(active.rate).setPitch(1f)
          currentPlayer.start()
          active.paused = false
        }
        promise.resolve(true)
      } catch (_: Exception) {
        endPlayback("failed")
        promise.resolve(false)
      }
    }
  }

  @ReactMethod
  fun seekPlayback(id: String, positionMs: Double, promise: Promise) {
    handler.post {
      val active = playback
      val currentPlayer = player
      if (!positionMs.isFinite() || active == null || active.id != id ||
        !active.prepared || currentPlayer == null
      ) {
        promise.resolve(false)
        return@post
      }
      try {
        val duration = currentPlayer.duration
        if (duration <= 0 || (!active.paused && !currentPlayer.isPlaying)) {
          promise.resolve(false)
          return@post
        }
        val target = positionMs.coerceIn(0.0, max(0, duration - 50).toDouble()).toInt()
        val seek = PendingSeek(target, promise)
        if (active.seekInFlight != null) {
          // MediaPlayer may coalesce overlapping seeks. Serialize them so an
          // old completion cannot acknowledge a newer target.
          active.seekInFlight?.complete(false)
          active.queuedSeek?.complete(false)
          active.queuedSeek = seek
        } else {
          beginSeek(active, currentPlayer, seek)
        }
      } catch (_: Exception) {
        if (playback === active) endPlayback("failed")
        promise.resolve(false)
      }
    }
  }

  private fun beginSeek(active: Playback, currentPlayer: MediaPlayer, seek: PendingSeek) {
    active.seekInFlight = seek
    val timeout = Runnable {
      if (playback === active && player === currentPlayer && active.seekInFlight === seek) {
        endPlayback("failed")
      }
    }
    active.seekTimeout = timeout
    handler.postDelayed(timeout, 3_000)
    try {
      // Seeking preserves play/pause. Stay just below the end to avoid an
      // accidental completion when scrubbing to the waveform's far edge.
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        currentPlayer.seekTo(seek.positionMs.toLong(), MediaPlayer.SEEK_CLOSEST)
      } else {
        @Suppress("DEPRECATION")
        currentPlayer.seekTo(seek.positionMs)
      }
    } catch (_: Exception) {
      if (playback === active) endPlayback("failed")
    }
  }

  private fun completeSeek(active: Playback, currentPlayer: MediaPlayer) {
    val completed = active.seekInFlight ?: return
    active.seekInFlight = null
    active.seekTimeout?.let { handler.removeCallbacks(it) }
    active.seekTimeout = null
    val queued = active.queuedSeek
    active.queuedSeek = null
    completed.complete(queued == null)
    if (queued != null) beginSeek(active, currentPlayer, queued)
  }

  @ReactMethod
  fun setPlaybackRate(id: String, rate: Double, promise: Promise) {
    handler.post {
      val active = playback
      val currentPlayer = player
      if (rate !in listOf(1.0, 1.5, 2.0) || active == null || active.id != id ||
        !active.prepared || currentPlayer == null
      ) {
        promise.resolve(false)
        return@post
      }
      try {
        if (!active.paused) {
          if (!currentPlayer.isPlaying) {
            promise.resolve(false)
            return@post
          }
          currentPlayer.playbackParams = PlaybackParams().setSpeed(rate.toFloat()).setPitch(1f)
        }
        // Setting PlaybackParams while paused can auto-start Android audio.
        // Preserve the request and apply it only on explicit resume instead.
        active.rate = rate.toFloat()
        promise.resolve(true)
      } catch (_: Exception) {
        if (playback === active) endPlayback("failed")
        promise.resolve(false)
      }
    }
  }

  @ReactMethod
  fun stopPlayback(id: String) {
    handler.post { if (playback?.id == id) endPlayback("stopped") }
  }

  override fun onHostResume() = Unit
  override fun onHostPause() {
    handler.post {
      discardRecording()
      endPlayback("stopped")
    }
  }
  override fun onHostDestroy() = onHostPause()

  override fun invalidate() {
    context.removeLifecycleEventListener(this)
    onHostPause()
    handler.post {
      completedRecordingIds.forEach { recordingFile(it).delete() }
      completedRecordingIds.clear()
    }
    super.invalidate()
  }

  private fun discardRecording() {
    val active = recording ?: return
    recording = null
    try {
      active.recorder.stop()
    } catch (_: RuntimeException) {
      // Android rejects stopping if no encoder sample was written yet.
    } finally {
      active.recorder.release()
      recordingFile(active.id).delete()
    }
  }

  private fun endPlayback(outcome: String) {
    val active = playback ?: return
    playback = null
    active.cancelled = true
    active.seekTimeout?.let { handler.removeCallbacks(it) }
    active.seekTimeout = null
    active.seekInFlight?.complete(false)
    active.seekInFlight = null
    active.queuedSeek?.complete(false)
    active.queuedSeek = null
    player?.release()
    player = null
    // Local preview borrows its file. releaseRecording owns that deletion;
    // downloaded attachment files remain owned by their playback instance.
    if (active.recordingId == null) active.file?.delete()
    if (focused) abandonFocus()
    active.promise.resolve(Arguments.createMap().apply {
      putInt("status", active.status)
      putString("outcome", outcome)
    })
  }

  @Suppress("DEPRECATION")
  private fun requestFocus(active: Playback): Boolean {
    val owner = Any()
    audioFocusOwner = owner
    val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
      if (change < 0) handler.post {
        if (audioFocusOwner === owner && playback === active) endPlayback("stopped")
      }
    }
    audioFocusListener = focusListener
    val result = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
        .setAudioAttributes(audioAttributes)
        .setOnAudioFocusChangeListener(focusListener, handler)
        .build()
      audioFocusRequest = request
      audio.requestAudioFocus(request)
    } else {
      audio.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
    }
    focused = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    if (!focused) {
      audioFocusOwner = null
      audioFocusListener = null
      audioFocusRequest = null
    }
    return focused
  }

  @Suppress("DEPRECATION")
  private fun abandonFocus() {
    audioFocusOwner = null
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      audioFocusRequest?.let { audio.abandonAudioFocusRequest(it) }
      audioFocusRequest = null
    } else {
      audioFocusListener?.let { audio.abandonAudioFocus(it) }
    }
    audioFocusListener = null
    focused = false
  }

  @Suppress("DEPRECATION")
  private fun newRecorder() =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(context) else MediaRecorder()

  private fun isIdentifier(value: String) =
    value.matches(Regex("^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$"))

  private fun voiceDirectory() = File(context.cacheDir, "MiaoxunChatVoice").apply { mkdirs() }

  private fun recordingFile(id: String) = File(voiceDirectory(), "$id.m4a")

  companion object {
    private const val MAX_BYTES = 8 * 1024 * 1024
  }
}
