package com.gary.miaoxun.rn

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener
import androidx.core.content.ContextCompat
import java.util.Locale

class MiaoxunSpeechModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext), PermissionListener {
  private val mainHandler = Handler(Looper.getMainLooper())
  private var speechPromise: Promise? = null
  private var pendingLanguageCode: String? = null
  private var recognizer: SpeechRecognizer? = null
  private var bestPartialText = ""

  override fun getName(): String = "MiaoxunSpeechModule"

  @ReactMethod
  fun recognizeOnce(languageCode: String?, promise: Promise) {
    if (speechPromise != null) {
      promise.reject("speech_busy", "语音识别正在进行。")
      return
    }

    if (!SpeechRecognizer.isRecognitionAvailable(reactContext)) {
      promise.reject("speech_unavailable", "当前设备没有可用的系统语音识别服务。")
      return
    }

    val activity = currentActivity
    if (activity == null) {
      promise.reject("activity_unavailable", "无法请求麦克风权限。")
      return
    }

    if (hasAudioPermission()) {
      startRecognition(languageCode, promise)
      return
    }

    if (activity !is PermissionAwareActivity) {
      promise.reject("permission_unavailable", "当前 Activity 无法请求麦克风权限。")
      return
    }

    speechPromise = promise
    pendingLanguageCode = languageCode
    activity.requestPermissions(
      arrayOf(Manifest.permission.RECORD_AUDIO),
      SPEECH_PERMISSION_REQUEST,
      this,
    )
  }

  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<out String>,
    grantResults: IntArray,
  ): Boolean {
    if (requestCode != SPEECH_PERMISSION_REQUEST) {
      return false
    }

    val promise = speechPromise ?: return true
    val languageCode = pendingLanguageCode
    speechPromise = null
    pendingLanguageCode = null

    if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
      startRecognition(languageCode, promise)
    } else {
      promise.reject("speech_denied", "未获得麦克风权限。")
    }
    return true
  }

  private fun hasAudioPermission(): Boolean =
    ContextCompat.checkSelfPermission(
      reactContext,
      Manifest.permission.RECORD_AUDIO,
    ) == PackageManager.PERMISSION_GRANTED

  private fun startRecognition(languageCode: String?, promise: Promise) {
    speechPromise = promise
    bestPartialText = ""
    mainHandler.post {
      try {
        val nextRecognizer = SpeechRecognizer.createSpeechRecognizer(reactContext)
        recognizer = nextRecognizer
        nextRecognizer.setRecognitionListener(createRecognitionListener())
        nextRecognizer.startListening(createIntent(languageCode))
        mainHandler.postDelayed(timeoutRunnable, RECOGNITION_TIMEOUT_MS)
      } catch (error: Exception) {
        finishWithError("speech_failed", error.localizedMessage ?: "语音识别启动失败。", error)
      }
    }
  }

  private fun createIntent(languageCode: String?): Intent =
    Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
      putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      putExtra(RecognizerIntent.EXTRA_LANGUAGE, normalizeLanguage(languageCode))
      putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
      putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
    }

  private fun createRecognitionListener(): RecognitionListener =
    object : RecognitionListener {
      override fun onReadyForSpeech(params: Bundle?) = Unit
      override fun onBeginningOfSpeech() = Unit
      override fun onRmsChanged(rmsdB: Float) = Unit
      override fun onBufferReceived(buffer: ByteArray?) = Unit
      override fun onEndOfSpeech() = Unit
      override fun onEvent(eventType: Int, params: Bundle?) = Unit

      override fun onPartialResults(partialResults: Bundle?) {
        val text = firstResult(partialResults).trim()
        if (text.isNotEmpty()) {
          bestPartialText = text
        }
      }

      override fun onResults(results: Bundle?) {
        val text = firstResult(results).trim()
        if (text.isNotEmpty()) {
          finishWithText(text)
          return
        }
        if (bestPartialText.isNotBlank()) {
          finishWithText(bestPartialText)
        } else {
          finishWithError("speech_empty", "没有识别到有效文字。")
        }
      }

      override fun onError(error: Int) {
        if (bestPartialText.isNotBlank() && (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT)) {
          finishWithText(bestPartialText)
          return
        }
        finishWithError(speechErrorCode(error), speechErrorMessage(error))
      }
    }

  private fun firstResult(bundle: Bundle?): String =
    bundle
      ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
      ?.firstOrNull()
      .orEmpty()

  private fun normalizeLanguage(languageCode: String?): String =
    when (languageCode) {
      "en" -> Locale.US.toLanguageTag()
      "zh", null, "" -> Locale.SIMPLIFIED_CHINESE.toLanguageTag()
      else -> languageCode
    }

  private fun speechErrorCode(error: Int): String =
    when (error) {
      SpeechRecognizer.ERROR_AUDIO -> "speech_audio"
      SpeechRecognizer.ERROR_CLIENT -> "speech_client"
      SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "speech_denied"
      SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "speech_network"
      SpeechRecognizer.ERROR_NO_MATCH -> "speech_empty"
      SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "speech_busy"
      SpeechRecognizer.ERROR_SERVER -> "speech_server"
      SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "speech_timeout"
      else -> "speech_failed"
    }

  private fun speechErrorMessage(error: Int): String =
    when (error) {
      SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "未获得麦克风权限。"
      SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "语音识别网络不可用。"
      SpeechRecognizer.ERROR_NO_MATCH -> "没有识别到有效文字。"
      SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "语音识别正在进行。"
      SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "没有检测到语音。"
      else -> "语音识别失败。"
    }

  private val timeoutRunnable = Runnable {
    if (bestPartialText.isNotBlank()) {
      finishWithText(bestPartialText)
    } else {
      finishWithError("speech_timeout", "没有检测到语音。")
    }
  }

  private fun finishWithText(text: String) {
    val promise = speechPromise ?: return
    cleanup()
    promise.resolve(
      Arguments.createMap().apply {
        putString("text", text)
      },
    )
  }

  private fun finishWithError(code: String, message: String, error: Throwable? = null) {
    val promise = speechPromise ?: return
    cleanup()
    if (error == null) {
      promise.reject(code, message)
    } else {
      promise.reject(code, message, error)
    }
  }

  private fun cleanup() {
    mainHandler.removeCallbacks(timeoutRunnable)
    recognizer?.cancel()
    recognizer?.destroy()
    recognizer = null
    speechPromise = null
    pendingLanguageCode = null
    bestPartialText = ""
  }

  companion object {
    private const val SPEECH_PERMISSION_REQUEST = 43903
    private const val RECOGNITION_TIMEOUT_MS = 15000L
  }
}
