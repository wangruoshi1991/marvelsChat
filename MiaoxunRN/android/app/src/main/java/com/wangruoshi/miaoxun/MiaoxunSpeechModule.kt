package com.wangruoshi.miaoxun

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener

class MiaoxunSpeechModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private val mainHandler = Handler(Looper.getMainLooper())
  private var speechPromise: Promise? = null
  private var requestId: String? = null
  private var permissionPending = false
  private var permissionId: String? = null
  private var permissionPromise: Promise? = null
  private var recognizer: SpeechRecognizer? = null
  private var bestPartialText = ""
  private var timeout: Runnable? = null

  override fun getName(): String = "MiaoxunSpeechModule"
  @ReactMethod fun addListener(eventName: String) = Unit
  @ReactMethod fun removeListeners(count: Double) = Unit

  @ReactMethod
  fun recognize(id: String, languageCode: String?, promise: Promise) {
    mainHandler.post {
      if (requestId != null || permissionPending) {
        promise.reject("speech_busy", "语音识别或系统授权正在进行。")
        return@post
      }
      if (!SpeechRecognizer.isRecognitionAvailable(reactContext)) {
        promise.reject("speech_unavailable", "当前设备没有可用的系统语音识别服务。")
        return@post
      }
      if (!hasAudioPermission()) {
        promise.reject("speech_permission_required", "首次使用请先开启语音权限，再长按说话。")
        return@post
      }
      requestId = id
      speechPromise = promise
      bestPartialText = ""
      emitUpdate("preparing")
      startRecognition(id, languageCode)
    }
  }

  private fun hasAudioPermission(): Boolean = ContextCompat.checkSelfPermission(
    reactContext, Manifest.permission.RECORD_AUDIO,
  ) == PackageManager.PERMISSION_GRANTED

  // Asking for permission is a separate operation and can never start recording.
  @ReactMethod
  fun prepare(id: String, promise: Promise) {
    mainHandler.post {
      if (requestId != null || permissionPending || permissionId != null) {
        promise.reject("speech_busy", "语音识别或系统授权正在进行。")
        return@post
      }
      if (hasAudioPermission()) {
        promise.resolve(Arguments.createMap().apply { putBoolean("ready", true) })
        return@post
      }
      val activity = reactContext.currentActivity as? PermissionAwareActivity
      if (activity == null) {
        promise.reject("permission_unavailable", "当前页面无法请求麦克风权限。")
        return@post
      }
      permissionId = id
      permissionPromise = promise
      permissionPending = true
      val listener = PermissionListener { code, _, results ->
        if (code != SPEECH_PERMISSION_REQUEST) false else {
          permissionPending = false
          if (permissionId == id) {
            if (results.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
              val completion = permissionPromise
              clearPermissionState()
              completion?.resolve(Arguments.createMap().apply { putBoolean("ready", true) })
            } else finishPermissionError("speech_denied", "未获得麦克风权限，请前往系统设置开启。")
          }
          true
        }
      }
      activity.requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), SPEECH_PERMISSION_REQUEST, listener)
    }
  }

  private fun clearPermissionState() {
    permissionId = null
    permissionPromise = null
  }

  private fun finishPermissionError(code: String, message: String) {
    val promise = permissionPromise
    clearPermissionState()
    promise?.reject(code, message)
  }

  @ReactMethod
  fun finish(id: String) {
    mainHandler.post {
      if (requestId != id) return@post
      val activeRecognizer = recognizer
      if (activeRecognizer == null) {
        finishWithError("speech_cancelled", "语音输入已取消，请在授权后重新长按。")
      } else {
        activeRecognizer.stopListening()
        emitUpdate("finishing")
        scheduleTimeout(id, 3000L)
      }
    }
  }

  @ReactMethod
  fun cancel(id: String) {
    mainHandler.post {
      if (permissionId == id) finishPermissionError("speech_cancelled", "语音授权已取消。")
      if (requestId == id) finishWithError("speech_cancelled", "语音输入已取消。")
    }
  }

  private fun startRecognition(id: String, languageCode: String?) {
    if (requestId != id) return
    try {
      val nextRecognizer = SpeechRecognizer.createSpeechRecognizer(reactContext)
      recognizer = nextRecognizer
      nextRecognizer.setRecognitionListener(createRecognitionListener(id))
      nextRecognizer.startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, if (languageCode == "en") "en-US" else "zh-CN")
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
      })
      scheduleTimeout(id, 30000L)
    } catch (error: Exception) {
      finishWithError("speech_failed", "语音识别启动失败。", error)
    }
  }

  private fun createRecognitionListener(id: String): RecognitionListener = object : RecognitionListener {
    override fun onReadyForSpeech(params: Bundle?) { if (requestId == id) emitUpdate("listening") }
    override fun onBeginningOfSpeech() = Unit
    override fun onRmsChanged(rmsdB: Float) = Unit
    override fun onBufferReceived(buffer: ByteArray?) = Unit
    override fun onEndOfSpeech() { if (requestId == id) emitUpdate("finishing") }
    override fun onEvent(eventType: Int, params: Bundle?) = Unit
    override fun onPartialResults(partialResults: Bundle?) {
      if (requestId != id) return
      bestPartialText = firstResult(partialResults).trim()
      emitUpdate("listening")
    }
    override fun onResults(results: Bundle?) {
      if (requestId != id) return
      finishWithText(firstResult(results).trim().ifEmpty { bestPartialText })
    }
    override fun onError(error: Int) {
      if (requestId != id) return
      val message = when (error) {
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "未获得麦克风权限，可前往系统设置开启。"
        SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "系统语音识别网络不可用，请重试或使用键盘。"
        SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "没有识别到有效文字，请重试或使用键盘。"
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "系统语音识别正忙，请稍后重试。"
        else -> "系统语音识别中断，请重试或使用键盘。"
      }
      finishWithError("speech_failed", message)
    }
  }

  private fun firstResult(bundle: Bundle?): String = bundle
    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()

  private fun emitUpdate(state: String) {
    val id = requestId ?: return
    reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(
      "MiaoxunSpeechUpdate",
      Arguments.createMap().apply {
        putString("requestId", id)
        putString("state", state)
        putString("text", bestPartialText)
      },
    )
  }

  private fun scheduleTimeout(id: String, delay: Long) {
    timeout?.let(mainHandler::removeCallbacks)
    timeout = Runnable { if (requestId == id) finishWithText(bestPartialText) }.also {
      mainHandler.postDelayed(it, delay)
    }
  }

  private fun finishWithText(text: String) {
    if (text.isBlank()) {
      finishWithError("speech_empty", "没有识别到有效文字，请重试或使用键盘。")
      return
    }
    val promise = speechPromise ?: return
    cleanup()
    promise.resolve(Arguments.createMap().apply { putString("text", text) })
  }

  private fun finishWithError(code: String, message: String, error: Throwable? = null) {
    val promise = speechPromise ?: return
    cleanup()
    if (error == null) promise.reject(code, message) else promise.reject(code, message, error)
  }

  private fun cleanup() {
    // Clear the identity first: cancelled/late native callbacks cannot finish another session.
    requestId = null
    speechPromise = null
    timeout?.let(mainHandler::removeCallbacks)
    timeout = null
    recognizer?.cancel()
    recognizer?.destroy()
    recognizer = null
    bestPartialText = ""
  }

  override fun invalidate() {
    mainHandler.post {
      finishPermissionError("speech_cancelled", "语音授权已取消。")
      finishWithError("speech_cancelled", "语音输入已取消。")
    }
    super.invalidate()
  }

  companion object { private const val SPEECH_PERMISSION_REQUEST = 43903 }
}
