package com.wangruoshi.miaoxun

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.annotation.RequiresApi
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/** Route selection only. WebRTC continues to own capture, playback, audio mode and focus. */
class MiaoxunCallAudioRouteModule(
  private val context: ReactApplicationContext,
) : ReactContextBaseJavaModule(context) {
  private val handler = Handler(Looper.getMainLooper())
  private val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  @Volatile private var invalidated = false
  private var listenerCount = 0
  private var observing = false
  private var modernObserver: ModernObserver? = null
  private var ownsCommunicationRoute = false
  private var previousSpeaker: Boolean? = null
  private var lastSnapshot: RouteSnapshot? = null

  private data class Route(val id: String, val kind: String, val name: String? = null)
  private data class RouteSnapshot(val currentId: String?, val devices: List<Route>) {
    fun toMap(): WritableMap = Arguments.createMap().apply {
      if (currentId == null) putNull("currentId") else putString("currentId", currentId)
      putArray("devices", Arguments.createArray().apply {
        devices.forEach { route ->
          pushMap(Arguments.createMap().apply {
            putString("id", route.id)
            putString("kind", route.kind)
            route.name?.let { putString("name", it) }
          })
        }
      })
    }
  }

  private val deviceCallback = object : AudioDeviceCallback() {
    override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>?) = emitSnapshot()
    override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>?) = emitSnapshot()
  }

  override fun getName(): String = "MiaoxunCallAudioRoute"

  @ReactMethod
  fun getRoutes(promise: Promise) = onMain(promise) {
    // Reading must never activate a session or override the default output.
    promise.resolve(snapshot().toMap())
  }

  @ReactMethod
  fun setRoute(id: String, promise: Promise) = onMain(promise) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val device = audio.availableCommunicationDevices.firstOrNull { deviceId(it) == id }
      if (device == null) {
        promise.reject("call_audio_route_unavailable", "该音频设备已断开或不支持通话。")
        return@onMain
      }
      if (kind(device) == "bluetooth" && !hasBluetoothPermission()) {
        promise.reject("call_audio_bluetooth_permission_required", "请允许附近设备权限后选择蓝牙音频。")
        return@onMain
      }
      if (!audio.setCommunicationDevice(device)) {
        promise.reject("call_audio_route_failed", "系统未接受音频设备切换，请重新选择。")
        return@onMain
      }
      ownsCommunicationRoute = true
    } else {
      if (legacySnapshot().devices.none { it.id == id }) {
        promise.reject("call_audio_route_unavailable", "当前 Android 系统或外接设备不支持在 App 内切换此音频路线。")
        return@onMain
      }
      @Suppress("DEPRECATION")
      if (previousSpeaker == null) previousSpeaker = audio.isSpeakerphoneOn
      @Suppress("DEPRECATION")
      audio.isSpeakerphoneOn = id == LEGACY_SPEAKER
    }
    // The returned state is the actual system route, not the requested route.
    // Bluetooth establishment can finish later and emits a device-change event.
    promise.resolve(snapshot().toMap())
    emitSnapshot()
  }

  @ReactMethod
  fun clearRoute(promise: Promise) = onMain(promise) {
    clearOwnedRoute()
    promise.resolve(null)
    emitSnapshot()
  }

  @ReactMethod
  fun addListener(eventName: String) {
    if (eventName != EVENT) return
    handler.post {
      if (invalidated) return@post
      listenerCount += 1
      if (!observing) {
        audio.registerAudioDeviceCallback(deviceCallback, handler)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          modernObserver = ModernObserver(audio, handler) { emitSnapshot() }.also { it.start() }
        }
        observing = true
      }
      emitSnapshot()
    }
  }

  @ReactMethod
  fun removeListeners(count: Double) {
    handler.post {
      listenerCount = (listenerCount - count.toInt().coerceAtLeast(0)).coerceAtLeast(0)
      if (listenerCount == 0) stopObserving()
    }
  }

  private fun onMain(promise: Promise, action: () -> Unit) {
    handler.post {
      if (invalidated) {
        promise.reject("call_audio_route_unavailable", "音频路由服务已关闭。")
        return@post
      }
      try {
        action()
      } catch (error: SecurityException) {
        promise.reject("call_audio_route_permission", "系统未允许访问此音频设备。", error)
      } catch (error: Exception) {
        promise.reject("call_audio_route_failed", "无法读取或切换音频设备，请重试。", error)
      }
    }
  }

  private fun snapshot(): RouteSnapshot {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return legacySnapshot()
    val devices = audio.availableCommunicationDevices.map { device ->
      val routeKind = kind(device)
      val name = if (routeKind == "bluetooth" && !hasBluetoothPermission()) null else {
        try { device.productName?.toString()?.take(160)?.takeIf { it.isNotBlank() } }
        catch (_: SecurityException) { null }
      }
      Route(deviceId(device), routeKind, name)
    }
    val current = audio.communicationDevice?.let { deviceId(it) }
    return RouteSnapshot(current?.takeIf { id -> devices.any { it.id == id } }, devices)
  }

  @Suppress("DEPRECATION")
  private fun legacySnapshot(): RouteSnapshot {
    val outputs = audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
    // Before API 31 there is no public per-device communication routing API.
    // Do not claim an attached headset is selectable, or infer its active route
    // from getDevices(), which describes connected devices rather than routing.
    if (audio.isBluetoothScoOn || outputs.any { isExternalLegacyDevice(it) }) {
      return RouteSnapshot(null, emptyList())
    }
    val devices = buildList {
      if (outputs.any { it.type == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE }) {
        add(Route(LEGACY_EARPIECE, "earpiece"))
      }
      if (outputs.any { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }) {
        add(Route(LEGACY_SPEAKER, "speaker"))
      }
    }
    val current = if (audio.isSpeakerphoneOn) LEGACY_SPEAKER else LEGACY_EARPIECE
    return RouteSnapshot(current.takeIf { id -> devices.any { it.id == id } }, devices)
  }

  private fun isExternalLegacyDevice(device: AudioDeviceInfo): Boolean = when (device.type) {
    AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
    AudioDeviceInfo.TYPE_USB_DEVICE, AudioDeviceInfo.TYPE_USB_ACCESSORY,
    AudioDeviceInfo.TYPE_USB_HEADSET, AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
    AudioDeviceInfo.TYPE_BLUETOOTH_A2DP, AudioDeviceInfo.TYPE_HEARING_AID -> true
    else -> false
  }

  private fun kind(device: AudioDeviceInfo): String = when (device.type) {
    AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "earpiece"
    AudioDeviceInfo.TYPE_BUILTIN_SPEAKER, AudioDeviceInfo.TYPE_BUILTIN_SPEAKER_SAFE -> "speaker"
    AudioDeviceInfo.TYPE_BLUETOOTH_SCO, AudioDeviceInfo.TYPE_BLE_HEADSET,
    AudioDeviceInfo.TYPE_BLE_SPEAKER, AudioDeviceInfo.TYPE_HEARING_AID -> "bluetooth"
    AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
    AudioDeviceInfo.TYPE_USB_DEVICE, AudioDeviceInfo.TYPE_USB_ACCESSORY,
    AudioDeviceInfo.TYPE_USB_HEADSET -> "wired"
    else -> "other"
  }

  private fun deviceId(device: AudioDeviceInfo): String = "device:${device.id}"

  private fun hasBluetoothPermission(): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
      context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED

  private fun emitSnapshot() {
    if (invalidated || listenerCount == 0 || !context.hasActiveReactInstance()) return
    val current = try { snapshot() } catch (_: Exception) { RouteSnapshot(null, emptyList()) }
    if (current == lastSnapshot) return
    lastSnapshot = current
    context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(EVENT, current.toMap())
  }

  @Suppress("DEPRECATION")
  private fun clearOwnedRoute() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && ownsCommunicationRoute) {
      audio.clearCommunicationDevice()
      ownsCommunicationRoute = false
    }
    previousSpeaker?.let { original ->
      audio.isSpeakerphoneOn = original
      previousSpeaker = null
    }
  }

  private fun stopObserving() {
    if (observing) audio.unregisterAudioDeviceCallback(deviceCallback)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) modernObserver?.stop()
    modernObserver = null
    observing = false
    lastSnapshot = null
  }

  override fun invalidate() {
    invalidated = true
    handler.post {
      stopObserving()
      try { clearOwnedRoute() } catch (_: Exception) { /* React is already gone. */ }
    }
    super.invalidate()
  }

  @RequiresApi(Build.VERSION_CODES.S)
  private class ModernObserver(
    private val audio: AudioManager,
    private val handler: Handler,
    onChange: () -> Unit,
  ) {
    private val listener = AudioManager.OnCommunicationDeviceChangedListener { onChange() }
    fun start() = audio.addOnCommunicationDeviceChangedListener({ runnable -> handler.post(runnable) }, listener)
    fun stop() = audio.removeOnCommunicationDeviceChangedListener(listener)
  }

  companion object {
    private const val EVENT = "MiaoxunCallAudioRouteChanged"
    private const val LEGACY_EARPIECE = "legacy:earpiece"
    private const val LEGACY_SPEAKER = "legacy:speaker"
  }
}
