package com.wangruoshi.miaoxun

import android.Manifest
import android.content.ContentValues
import android.content.pm.PackageManager
import android.os.Build
import android.provider.MediaStore
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

class MiaoxunMediaLibraryModule(
  private val context: ReactApplicationContext,
) : ReactContextBaseJavaModule(context) {
  override fun getName() = "MiaoxunMediaLibraryModule"

  @ReactMethod
  fun saveChatImage(attachmentId: String, token: String, promise: Promise) {
    if (!isUuid(attachmentId)) {
      promise.reject("chat_media_invalid_id", "图片引用无效，未保存。")
      return
    }
    if (token.isBlank()) {
      promise.reject("chat_media_missing_session", "登录状态已失效，请重新登录后再保存。")
      return
    }
    if (Build.VERSION.SDK_INT in 24..28 &&
      context.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED
    ) {
      currentActivity?.requestPermissions(arrayOf(Manifest.permission.WRITE_EXTERNAL_STORAGE), 48173)
      promise.reject("chat_media_photo_access_pending", "请允许相册写入权限后再次点击保存。")
      return
    }
    Thread {
      var connection: HttpURLConnection? = null
      var insertedUri: android.net.Uri? = null
      try {
        val origin = BuildConfig.MIAOXUN_API_BASE_URL.trimEnd('/')
        val base = android.net.Uri.parse(origin)
        if (base.scheme !in setOf("http", "https") || base.host.isNullOrBlank() ||
          base.encodedAuthority?.contains("@") == true || base.query != null || base.fragment != null ||
          (base.path?.isNotEmpty() == true && base.path != "/")
        ) throw IllegalArgumentException("invalid API origin")
        connection = (URL("$origin/api/chat-attachments/$attachmentId/content").openConnection() as HttpURLConnection).apply {
          requestMethod = "GET"
          connectTimeout = 15000
          readTimeout = 15000
          instanceFollowRedirects = false
          setRequestProperty("Authorization", "Bearer $token")
          setRequestProperty("Accept", "image/*")
        }
        if (connection.responseCode !in 200..299) throw IllegalStateException("download failed")
        val bytes = connection.inputStream.use { it.readBytes() }
        if (bytes.isEmpty() || bytes.size > 8 * 1024 * 1024) throw IllegalStateException("invalid image")
        val values = ContentValues().apply {
          put(MediaStore.Images.Media.DISPLAY_NAME, "miaoxun-$attachmentId.jpg")
          put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
          if (Build.VERSION.SDK_INT >= 29) put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/Miaoxun")
          if (Build.VERSION.SDK_INT >= 29) put(MediaStore.Images.Media.IS_PENDING, 1)
        }
        val resolver = context.contentResolver
        insertedUri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
          ?: throw IllegalStateException("media insert failed")
        resolver.openOutputStream(insertedUri!!)?.use { it.write(bytes) }
          ?: throw IllegalStateException("media write failed")
        if (Build.VERSION.SDK_INT >= 29) {
          resolver.update(insertedUri!!, ContentValues().apply { put(MediaStore.Images.Media.IS_PENDING, 0) }, null, null)
        }
        val result = Arguments.createMap().apply {
          putString("status", "saved")
          putString("attachmentId", attachmentId)
        }
        promise.resolve(result)
      } catch (error: SecurityException) {
        insertedUri?.let { context.contentResolver.delete(it, null, null) }
        promise.reject("chat_media_photo_access_denied", "未获得保存到相册的权限。")
      } catch (_: Throwable) {
        insertedUri?.let { context.contentResolver.delete(it, null, null) }
        promise.reject("chat_media_save_failed", "保存到相册失败，请重试。")
      } finally {
        connection?.disconnect()
      }
    }.start()
  }

  private fun isUuid(value: String) =
    runCatching { UUID.fromString(value).toString() == value.lowercase() }.getOrDefault(false)
}
