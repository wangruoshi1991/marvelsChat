package com.wangruoshi.miaoxun

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener
import androidx.core.content.ContextCompat

class MiaoxunLocationModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext), PermissionListener {
  private var locationPromise: Promise? = null
  private val handler = Handler(Looper.getMainLooper())
  private val locationManager: LocationManager
    get() = reactContext.getSystemService(Context.LOCATION_SERVICE) as LocationManager

  override fun getName(): String = "MiaoxunLocationModule"

  @ReactMethod
  fun currentLocation(promise: Promise) {
    if (locationPromise != null) {
      promise.reject("location_busy", "定位请求正在进行。")
      return
    }

    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("activity_unavailable", "无法请求定位权限。")
      return
    }

    if (hasLocationPermission()) {
      requestSingleLocation(promise)
      return
    }

    if (activity !is PermissionAwareActivity) {
      promise.reject("permission_unavailable", "当前 Activity 无法请求定位权限。")
      return
    }

    locationPromise = promise
    activity.requestPermissions(
      arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
      LOCATION_PERMISSION_REQUEST,
      this,
    )
  }

  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<String>,
    grantResults: IntArray,
  ): Boolean {
    if (requestCode != LOCATION_PERMISSION_REQUEST) {
      return false
    }

    val promise = locationPromise ?: return true
    locationPromise = null
    if (grantResults.any { it == PackageManager.PERMISSION_GRANTED }) {
      requestSingleLocation(promise)
    } else {
      promise.reject("location_denied", "未获得定位权限。")
    }
    return true
  }

  private fun hasLocationPermission(): Boolean =
    ContextCompat.checkSelfPermission(
      reactContext,
      Manifest.permission.ACCESS_FINE_LOCATION,
    ) == PackageManager.PERMISSION_GRANTED ||
      ContextCompat.checkSelfPermission(
        reactContext,
        Manifest.permission.ACCESS_COARSE_LOCATION,
      ) == PackageManager.PERMISSION_GRANTED

  private fun requestSingleLocation(promise: Promise) {
    val provider = when {
      locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
      locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
      else -> {
        promise.reject("location_disabled", "系统定位服务未开启。")
        return
      }
    }
    val cachedLocation = latestRecentLocation()
    if (cachedLocation != null) {
      promise.resolve(locationToMap(cachedLocation))
      return
    }

    var completed = false

    val listener = object : LocationListener {
      override fun onLocationChanged(location: Location) {
        if (completed) return
        completed = true
        locationManager.removeUpdates(this)
        promise.resolve(locationToMap(location))
      }

      override fun onProviderDisabled(provider: String) {
        if (completed) return
        completed = true
        locationManager.removeUpdates(this)
        promise.reject("location_disabled", "系统定位服务未开启。")
      }

      @Deprecated("Deprecated in Android SDK")
      override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
    }

    try {
      val timeout = Runnable {
        if (completed) return@Runnable
        completed = true
        locationManager.removeUpdates(listener)
        promise.reject("location_timeout", "定位超时。")
      }
      handler.postDelayed(timeout, LOCATION_TIMEOUT_MS)
      locationManager.requestSingleUpdate(provider, listener, reactContext.mainLooper)
    } catch (error: SecurityException) {
      completed = true
      promise.reject("location_denied", "未获得定位权限。", error)
    }
  }

  private fun latestRecentLocation(): Location? {
    if (!hasLocationPermission()) return null
    val providers = listOf(LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER)
    return providers
      .filter { locationManager.isProviderEnabled(it) }
      .mapNotNull { provider ->
        try {
          locationManager.getLastKnownLocation(provider)
        } catch (_: SecurityException) {
          null
        }
      }
      .filter { location -> System.currentTimeMillis() - location.time <= RECENT_LOCATION_MAX_AGE_MS }
      .maxByOrNull { location -> location.time }
  }

  private fun locationToMap(location: Location) =
    Arguments.createMap().apply {
      putDouble("latitude", location.latitude)
      putDouble("longitude", location.longitude)
      putDouble("horizontalAccuracy", location.accuracy.toDouble())
    }

  companion object {
    private const val LOCATION_PERMISSION_REQUEST = 43902
    private const val LOCATION_TIMEOUT_MS = 15000L
    private const val RECENT_LOCATION_MAX_AGE_MS = 5 * 60 * 1000L
  }
}
