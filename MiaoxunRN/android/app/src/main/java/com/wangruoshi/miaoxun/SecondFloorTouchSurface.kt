package com.wangruoshi.miaoxun

import android.view.MotionEvent
import android.widget.ScrollView
import com.facebook.react.bridge.Arguments
import com.facebook.react.uimanager.PixelUtil
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.events.Event
import com.facebook.react.views.view.ReactViewGroup
import com.facebook.react.views.view.ReactViewManager

class SecondFloorTouchSurfaceManager : ReactViewManager() {
  override fun getName() = "MiaoxunSecondFloorTouchSurface"

  override fun createViewInstance(context: ThemedReactContext): ReactViewGroup =
    SecondFloorTouchSurface(context)

  override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> =
    mutableMapOf(SecondFloorTouchEvent.NAME to mapOf("registrationName" to "onFloorTouch"))
}

private class SecondFloorTouchSurface(
  private val reactContext: ThemedReactContext,
) : ReactViewGroup(reactContext) {
  private var tracking = false

  // A child ScrollView can cancel React Native's root touch stream while it
  // scrolls. This observer remains in the original Android dispatch path.
  override fun dispatchTouchEvent(event: MotionEvent): Boolean {
    val scroller = getChildAt(0) as? ScrollView
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        tracking = scroller != null && scroller.isShown
        if (tracking) emit("start", event, scroller)
      }
      MotionEvent.ACTION_MOVE -> if (tracking) emit("move", event, scroller)
      MotionEvent.ACTION_POINTER_DOWN, MotionEvent.ACTION_CANCEL -> if (tracking) {
        tracking = false
        emit("cancel", event, null)
      }
    }

    val handled = super.dispatchTouchEvent(event)
    if (tracking && event.actionMasked == MotionEvent.ACTION_UP) {
      tracking = false
      emit("end", event, scroller)
    }
    return handled
  }

  private fun emit(phase: String, event: MotionEvent, scroller: ScrollView?) {
    UIManagerHelper.getEventDispatcherForReactTag(reactContext, id)?.dispatchEvent(
      SecondFloorTouchEvent(
        UIManagerHelper.getSurfaceId(this),
        id,
        phase,
        PixelUtil.toDIPFromPixel(event.rawX),
        PixelUtil.toDIPFromPixel(event.rawY),
        scroller != null && !scroller.canScrollVertically(1),
      ),
    )
  }
}

private class SecondFloorTouchEvent(
  surfaceId: Int,
  viewId: Int,
  private val phase: String,
  private val x: Float,
  private val y: Float,
  private val atBottom: Boolean,
) : Event<SecondFloorTouchEvent>(surfaceId, viewId) {
  override fun getEventName() = NAME

  // Touch order and the first direction are used by the shared gesture.
  override fun canCoalesce() = false

  override fun getEventData() = Arguments.createMap().apply {
    putString("phase", phase)
    putDouble("x", x.toDouble())
    putDouble("y", y.toDouble())
    putBoolean("atBottom", atBottom)
  }

  companion object {
    const val NAME = "topFloorTouch"
  }
}
