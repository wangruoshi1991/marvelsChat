package com.wangruoshi.miaoxun

import android.app.Activity
import android.content.Intent
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil

class QRCodeScannerModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private var scanPromise: Promise? = null

  private val activityEventListener: ActivityEventListener =
    object : BaseActivityEventListener() {
      override fun onActivityResult(
        activity: Activity,
        requestCode: Int,
        resultCode: Int,
        data: Intent?,
      ) {
        if (requestCode != REQUEST_CODE) {
          return
        }

        val promise = scanPromise ?: return
        scanPromise = null

        when (resultCode) {
          Activity.RESULT_OK -> {
            val value = data?.getStringExtra(QRCodeScannerActivity.EXTRA_QR_VALUE).orEmpty()
            if (value.isBlank()) {
              promise.reject("scanner_empty", "二维码内容为空。")
            } else {
              promise.resolve(value)
            }
          }
          QRCodeScannerActivity.RESULT_PERMISSION_DENIED ->
            promise.reject("camera_denied", "未获得相机权限。")
          QRCodeScannerActivity.RESULT_CAMERA_FAILED ->
            promise.reject("camera_unavailable", "相机不可用，请关闭后重试。")
          Activity.RESULT_CANCELED ->
            promise.reject("scanner_cancelled", "已取消扫码。")
          else ->
            promise.reject("scanner_failed", "扫码失败。")
        }
      }
    }

  init {
    reactContext.addActivityEventListener(activityEventListener)
  }

  override fun getName(): String = "QRCodeScannerModule"

  @ReactMethod
  fun scan(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      if (scanPromise != null) {
        promise.reject("scanner_busy", "扫码器正在运行。")
        return@runOnUiThread
      }

      val activity = reactContext.currentActivity
      if (activity == null || activity.isFinishing || activity.isDestroyed) {
        promise.reject("activity_unavailable", "无法打开扫码页面。")
        return@runOnUiThread
      }

      scanPromise = promise
      try {
        activity.startActivityForResult(
          Intent(activity, QRCodeScannerActivity::class.java),
          REQUEST_CODE,
        )
      } catch (error: RuntimeException) {
        if (scanPromise === promise) {
          scanPromise = null
          promise.reject("scanner_failed", "无法打开扫码页面。", error)
        }
      }
    }
  }

  override fun invalidate() {
    reactContext.removeActivityEventListener(activityEventListener)
    UiThreadUtil.runOnUiThread {
      val promise = scanPromise
      scanPromise = null
      promise?.reject("scanner_cancelled", "已取消扫码。")
    }
    super.invalidate()
  }

  companion object {
    private const val REQUEST_CODE = 43901
  }
}
