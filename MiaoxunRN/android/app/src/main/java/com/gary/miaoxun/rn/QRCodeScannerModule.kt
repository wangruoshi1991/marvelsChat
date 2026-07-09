package com.gary.miaoxun.rn

import android.app.Activity
import android.content.Intent
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class QRCodeScannerModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private var scanPromise: Promise? = null

  private val activityEventListener: ActivityEventListener =
    object : BaseActivityEventListener() {
      override fun onActivityResult(
        activity: Activity?,
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
    if (scanPromise != null) {
      promise.reject("scanner_busy", "扫码器正在运行。")
      return
    }

    val activity = currentActivity
    if (activity == null) {
      promise.reject("activity_unavailable", "无法打开扫码页面。")
      return
    }

    scanPromise = promise
    activity.startActivityForResult(
      Intent(activity, QRCodeScannerActivity::class.java),
      REQUEST_CODE,
    )
  }

  companion object {
    private const val REQUEST_CODE = 43901
  }
}
