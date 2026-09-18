package com.wangruoshi.miaoxun

import android.os.Build
import android.view.HapticFeedbackConstants
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil

class MiaoxunHapticsModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "MiaoxunHapticsModule"

  @ReactMethod
  fun trigger(event: String) {
    val feedback =
      when (event) {
        "activation" -> HapticFeedbackConstants.LONG_PRESS
        "hover" -> HapticFeedbackConstants.CLOCK_TICK
        "confirmation" ->
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            HapticFeedbackConstants.CONFIRM
          } else {
            HapticFeedbackConstants.VIRTUAL_KEY
          }
        else -> throw IllegalArgumentException("Unsupported Miaoxun haptic event: $event")
      }
    val activity =
      reactContext.currentActivity
        ?: throw IllegalStateException("Miaoxun haptics require an active Activity.")
    UiThreadUtil.runOnUiThread {
      activity.window.decorView.performHapticFeedback(feedback)
    }
  }
}
