package com.gary.miaoxun.rn

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule

class MiaoxunConfigModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "MiaoxunConfigModule"

  override fun getConstants(): MutableMap<String, Any> =
    mutableMapOf("apiBaseURL" to BuildConfig.MIAOXUN_API_BASE_URL)
}
