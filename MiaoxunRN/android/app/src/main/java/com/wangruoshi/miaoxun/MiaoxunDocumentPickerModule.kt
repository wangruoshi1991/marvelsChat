package com.wangruoshi.miaoxun

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

class MiaoxunDocumentPickerModule(
  private val context: ReactApplicationContext,
) : ReactContextBaseJavaModule(context), ActivityEventListener {
  private val copies = mutableMapOf<String, File>()
  private var pendingPick: Promise? = null
  private val requestCode = 48172
  private val maximumFileBytes = 262144L
  private val maximumResponseBytes = 8192
  private val maximumBinaryUploadBytes = 8 * 1024 * 1024
  private val maximumBinaryResponseBytes = 256 * 1024
  private val binaryRequestTimeoutMs = 20000

  init {
    context.addActivityEventListener(this)
    File(context.filesDir, "MiaoxunDocuments").deleteRecursively()
  }

  override fun getName() = "MiaoxunDocumentPickerModule"

  @ReactMethod
  fun pick(promise: Promise) {
    if (pendingPick != null) {
      promise.reject("file_picker_busy", "文件选择器正在运行。")
      return
    }
    val activity = currentActivity
    if (activity == null) {
      promise.reject("file_picker_unavailable", "无法打开文件选择器。")
      return
    }
    pendingPick = promise
    try {
      val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = "*/*"
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      activity.startActivityForResult(intent, requestCode)
    } catch (_: Throwable) {
      pendingPick = null
      promise.reject("file_picker_unavailable", "无法打开文件选择器。")
    }
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode != this.requestCode) return
    val promise = pendingPick ?: return
    pendingPick = null
    if (resultCode != Activity.RESULT_OK) {
      promise.resolve(null)
      return
    }
    val source = data?.data
    if (source == null) {
      promise.reject("file_read_failed", "无法读取所选文件。")
      return
    }
    var destination: File? = null
    try {
      val key = UUID.randomUUID().toString().lowercase()
      val directory = File(context.filesDir, "MiaoxunDocuments")
      if (!directory.exists() && !directory.mkdirs()) throw IllegalStateException()
      destination = File(directory, key)
      val size = copyBounded(source, destination)
      if (size <= 0) throw IllegalStateException()
      copies[key] = destination
      val result = Arguments.createMap().apply {
        putString("uri", Uri.fromFile(destination).toString())
        putString("originalFilename", displayName(source))
        putString("mimeType", context.contentResolver.getType(source) ?: "application/octet-stream")
        putDouble("byteSize", size.toDouble())
        putString("idempotencyKey", key)
      }
      promise.resolve(result)
    } catch (_: Throwable) {
      destination?.delete()
      promise.reject("file_read_failed", "请选择非空且不超过256KiB的文件。")
    }
  }

  override fun onNewIntent(intent: Intent) = Unit

  @ReactMethod
  fun release(key: String, promise: Promise) {
    if (!isUuid(key)) {
      promise.resolve(null)
      return
    }
    val file = copies.remove(key)
    if (file == null || file.delete() || !file.exists()) promise.resolve(null)
    else promise.reject("file_cleanup_failed", "临时文件清理失败，请重试。")
  }

  @ReactMethod
  fun uploadChatAttachment(
    key: String,
    threadId: String,
    token: String,
    mimeType: String,
    encodedFilename: String,
    idempotencyKey: String,
    promise: Promise,
  ) {
    val file = copies[key]
    if (file == null || !file.isFile || file.length() !in 1..maximumFileBytes ||
      !isUuid(threadId) || !isUuid(idempotencyKey)
    ) {
      promise.reject("chat_file_upload_unavailable", "附件上传配置或临时文件不可用。")
      return
    }

    Thread {
      var connection: HttpURLConnection? = null
      try {
        val origin = BuildConfig.MIAOXUN_API_BASE_URL
        val base = Uri.parse(origin)
        if (base.scheme !in setOf("http", "https") || base.host.isNullOrBlank() ||
          base.encodedAuthority?.contains("@") == true || base.query != null || base.fragment != null ||
          (base.path?.isNotEmpty() == true && base.path != "/")
        ) throw IllegalArgumentException("invalid API origin")
        connection = (URL("${origin.trimEnd('/')}/api/threads/$threadId/attachments/upload").openConnection() as HttpURLConnection).apply {
          requestMethod = "POST"
          connectTimeout = 20000
          readTimeout = 20000
          instanceFollowRedirects = false
          doOutput = true
          setFixedLengthStreamingMode(file.length())
          setRequestProperty("Authorization", "Bearer $token")
          setRequestProperty("Content-Type", "application/octet-stream")
          setRequestProperty("X-Miaoxun-Attachment-Kind", "file")
          setRequestProperty("X-Miaoxun-Attachment-Mime", mimeType)
          setRequestProperty("X-Miaoxun-Filename", encodedFilename)
          setRequestProperty("Idempotency-Key", idempotencyKey)
          setRequestProperty("X-Miaoxun-App-Build", BuildConfig.VERSION_CODE.toString())
          setRequestProperty("X-Request-ID", "mx-${UUID.randomUUID().toString().lowercase()}")
        }
        connection.outputStream.use { output ->
          FileInputStream(file).use { input ->
            val buffer = ByteArray(8192)
            var total = 0L
            while (true) {
              val count = input.read(buffer)
              if (count < 0) break
              total += count
              if (total > maximumFileBytes) throw IllegalStateException("file size limit")
              output.write(buffer, 0, count)
            }
          }
        }
        val status = connection.responseCode
        val stream = if (status >= 400) connection.errorStream else connection.inputStream
        val body = stream?.use { readBounded(it) } ?: ""
        val result = Arguments.createMap().apply {
          putInt("status", status)
          putString("body", body)
        }
        promise.resolve(result)
      } catch (_: Throwable) {
        promise.reject("chat_file_upload_failed", "附件上传未确认，请重试。")
      } finally {
        connection?.disconnect()
      }
    }.start()
  }

  @ReactMethod
  fun requestBinary(
    method: String,
    path: String,
    token: String,
    uri: String,
    headers: ReadableMap?,
    maximumUploadBytes: Int,
    maximumResponseBytes: Int,
    promise: Promise,
  ) {
    val normalizedMethod = method.uppercase()
    if (normalizedMethod !in setOf("GET", "POST")) {
      promise.reject("binary_request_invalid_method", "仅支持 GET 或 POST 请求。")
      return
    }
    if (token.isBlank()) {
      promise.reject("binary_request_missing_session", "登录状态已失效，请重新登录。")
      return
    }
    if (maximumResponseBytes !in 1..maximumBinaryResponseBytes) {
      promise.reject("binary_request_invalid_limit", "响应大小限制无效。")
      return
    }
    if (normalizedMethod == "POST" &&
      (maximumUploadBytes !in 1..maximumBinaryUploadBytes || uri.isBlank())
    ) {
      promise.reject("binary_request_invalid_limit", "上传大小限制或文件引用无效。")
      return
    }
    if (normalizedMethod == "GET" && uri.isNotEmpty()) {
      promise.reject("binary_request_invalid_body", "GET 请求不接受请求体。")
      return
    }
    val requestHeaders = try {
      readBinaryHeaders(headers)
    } catch (error: IllegalArgumentException) {
      promise.reject("binary_request_invalid_headers", error.message ?: "请求头无效。")
      return
    }

    Thread {
      var ownedBody: File? = null
      var connection: HttpURLConnection? = null
      try {
        val url = buildBinaryApiUrl(path)
        if (normalizedMethod == "POST") {
          ownedBody = copyBinaryRequestBody(Uri.parse(uri), maximumUploadBytes.toLong())
        }
        val body = ownedBody
        connection = (url.openConnection() as HttpURLConnection).apply {
          requestMethod = normalizedMethod
          connectTimeout = binaryRequestTimeoutMs
          readTimeout = binaryRequestTimeoutMs
          instanceFollowRedirects = false
          setUseCaches(false)
          doInput = true
          doOutput = normalizedMethod == "POST"
          requestHeaders.forEach { (name, value) -> setRequestProperty(name, value) }
          setRequestProperty("Authorization", "Bearer $token")
          setRequestProperty("Cookie", "")
          if (normalizedMethod == "POST") {
            setRequestProperty("Content-Type", "application/octet-stream")
            setFixedLengthStreamingMode(body?.length() ?: 0L)
          }
        }
        if (normalizedMethod == "POST") {
          val uploadFile = body ?: throw IllegalStateException("missing request body")
          connection.outputStream.use { output ->
            FileInputStream(uploadFile).use { input ->
              val buffer = ByteArray(8192)
              var total = 0L
              while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                total += count
                if (total > maximumUploadBytes.toLong())
                  throw IllegalStateException("request body exceeds limit")
                output.write(buffer, 0, count)
              }
              if (total <= 0L) throw IllegalStateException("empty request body")
            }
          }
        }
        val status = connection.responseCode
        if (status in 300..399)
          throw IllegalStateException("redirect rejected")
        val responseStream = if (status >= 400) connection.errorStream else connection.inputStream
        val responseBody = responseStream?.use { readBounded(it, maximumResponseBytes) } ?: ""
        val responseRequestId =
          connection.getHeaderField("X-Request-ID")?.takeIf { it.isNotBlank() }
            ?: connection.getHeaderField("x-request-id")
              ?.takeIf { it.isNotBlank() }
        val result = Arguments.createMap().apply {
          putInt("status", status)
          putString("body", responseBody)
          if (responseRequestId != null) putString("requestId", responseRequestId)
        }
        promise.resolve(result)
      } catch (error: Throwable) {
        promise.reject(
          "binary_request_failed",
          error.message?.takeIf { it.isNotBlank() } ?: "二进制请求失败，请重试.",
        )
      } finally {
        connection?.disconnect()
        ownedBody?.delete()
      }
    }.start()
  }

  private fun isUuid(value: String) =
    runCatching { UUID.fromString(value).toString() == value.lowercase() }.getOrDefault(false)

  private fun displayName(uri: Uri): String {
    val cursor = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
    return cursor?.use { result ->
      if (result.moveToFirst()) result.getString(0)?.takeIf { it.isNotBlank() } ?: "attachment"
      else "attachment"
    } ?: "attachment"
  }

  private fun copyBounded(uri: Uri, destination: File): Long {
    val input = context.contentResolver.openInputStream(uri) ?: throw IllegalStateException()
    var total = 0L
    input.use { source ->
      FileOutputStream(destination).use { output ->
        val buffer = ByteArray(8192)
        while (true) {
          val count = source.read(buffer)
          if (count < 0) break
          total += count
          if (total > maximumFileBytes) throw IllegalStateException()
          output.write(buffer, 0, count)
        }
      }
    }
    return total
  }

  private fun copyBinaryRequestBody(uri: Uri, maximumBytes: Long): File {
    val scheme = uri.scheme?.lowercase()
    if (scheme !in setOf("file", "content"))
      throw IllegalArgumentException("POST 请求仅支持 file 或 content URI。")
    val directory = File(context.cacheDir, "MiaoxunBinaryRequests")
    if (!directory.exists() && !directory.mkdirs())
      throw IllegalStateException("无法创建请求临时目录。")
    val destination = File.createTempFile("request-", ".bin", directory)
    try {
      val source = context.contentResolver.openInputStream(uri)
        ?: throw IllegalStateException("无法读取请求文件。")
      var total = 0L
      source.use { input ->
        FileOutputStream(destination).use { output ->
          val buffer = ByteArray(8192)
          while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            total += count
            if (total > maximumBytes)
              throw IllegalStateException("请求文件超过大小限制。")
            output.write(buffer, 0, count)
          }
        }
      }
      if (total <= 0L) throw IllegalStateException("请求文件为空。")
      return destination
    } catch (error: Throwable) {
      destination.delete()
      throw error
    }
  }

  private fun readBinaryHeaders(headers: ReadableMap?): Map<String, String> {
    val values = linkedMapOf<String, String>()
    val iterator = headers?.keySetIterator() ?: return values
    val forbidden = setOf(
      "authorization",
      "cookie",
      "host",
      "content-length",
      "transfer-encoding",
    )
    while (iterator.hasNextKey()) {
      val name = iterator.nextKey()
      if (name.isBlank() || name.any { it == '\r' || it == '\n' })
        throw IllegalArgumentException("请求头名称无效。")
      if (name.lowercase() in forbidden)
        throw IllegalArgumentException("请求头不可覆盖认证、Host 或请求体边界。")
      if (headers.getType(name) != ReadableType.String)
        throw IllegalArgumentException("请求头值必须是字符串。")
      val value = headers.getString(name)
        ?: throw IllegalArgumentException("请求头值无效。")
      if (value.any { it == '\r' || it == '\n' })
        throw IllegalArgumentException("请求头值无效。")
      values[name] = value
    }
    return values
  }

  private fun buildBinaryApiUrl(path: String): URL {
    val origin = BuildConfig.MIAOXUN_API_BASE_URL.trimEnd('/')
    val base = Uri.parse(origin)
    if (base.scheme?.lowercase() !in setOf("http", "https") || base.host.isNullOrBlank() ||
      base.encodedAuthority?.contains("@") == true || base.query != null || base.fragment != null ||
      (base.path?.isNotEmpty() == true && base.path != "/")
    ) throw IllegalArgumentException("API origin 配置无效。")
    val decodedPath = Uri.decode(path)
    if (!path.startsWith("/api/") || path.contains('\\') || path.contains('?') || path.contains('#') ||
      decodedPath.split('/').any { it == ".." } || path.contains("//")
    ) throw IllegalArgumentException("请求路径无效。")
    val parsedPath = Uri.parse(path)
    if (parsedPath.scheme != null || parsedPath.host != null || parsedPath.authority != null)
      throw IllegalArgumentException("请求路径必须是同源 API 路径。")
    return URL(origin + path)
  }

  private fun readBounded(input: java.io.InputStream): String {
    return readBounded(input, maximumResponseBytes)
  }

  private fun readBounded(input: InputStream, limit: Int): String {
    val output = java.io.ByteArrayOutputStream()
    val buffer = ByteArray(1024)
    while (true) {
      val count = input.read(buffer)
      if (count < 0) break
      if (output.size() + count > limit) throw IllegalStateException("response size limit")
      output.write(buffer, 0, count)
    }
    return output.toString(Charsets.UTF_8.name())
  }
}
