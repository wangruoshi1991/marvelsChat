package com.wangruoshi.miaoxun

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.util.Log
import android.util.Size
import android.view.Gravity
import android.widget.Button
import android.widget.FrameLayout
import android.widget.TextView
import android.app.Activity
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.Executors

class QRCodeScannerActivity : ComponentActivity() {
  private val cameraExecutor = Executors.newSingleThreadExecutor()
  private var didFinish = false
  private lateinit var previewView: PreviewView
  private var analyzer: QRAnalyzer? = null
  private var analysis: ImageAnalysis? = null

  private val cameraPermissionLauncher =
    registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
      if (granted) {
        startCamera()
      } else {
        finishWithResult(RESULT_PERMISSION_DENIED)
      }
    }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    try {
      configureView()
      if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
        startCamera()
      } else {
        cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
      }
    } catch (error: RuntimeException) {
      Log.w(TAG, "Could not initialize the scanner", error)
      finishWithResult(RESULT_CAMERA_FAILED)
    }
  }

  override fun onDestroy() {
    analysis?.clearAnalyzer()
    analyzer?.close()
    cameraExecutor.shutdown()
    super.onDestroy()
  }

  private fun configureView() {
    WindowCompat.setDecorFitsSystemWindows(window, false)
    val root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
    previewView = PreviewView(this).apply { scaleType = PreviewView.ScaleType.FILL_CENTER }
    root.addView(
      previewView,
      FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT,
      ),
    )

    // Only the controls respect the insets. The camera reaches every display edge.
    val controls = FrameLayout(this)
    root.addView(controls, FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.MATCH_PARENT,
    ))
    ViewCompat.setOnApplyWindowInsetsListener(controls) { view, insets ->
      val safeArea = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(),
      )
      view.setPadding(
        safeArea.left + dp(16),
        safeArea.top + dp(12),
        safeArea.right + dp(16),
        safeArea.bottom + dp(24),
      )
      insets
    }

    val closeButton = Button(this).apply {
      text = "关闭"
      isAllCaps = false
      textSize = 14f
      setTextColor(Color.WHITE)
      minHeight = dp(44)
      minWidth = dp(68)
      setPadding(dp(12), dp(6), dp(12), dp(6))
      background = controlBackground()
      setOnClickListener { finishWithResult(Activity.RESULT_CANCELED) }
    }
    controls.addView(closeButton, FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.WRAP_CONTENT,
      FrameLayout.LayoutParams.WRAP_CONTENT,
      Gravity.TOP or Gravity.START,
    ))

    val hint = TextView(this).apply {
      text = "将镜头对准妙讯身份码"
      textSize = 16f
      setTextColor(Color.WHITE)
      gravity = Gravity.CENTER
      setPadding(dp(18), dp(10), dp(18), dp(10))
      background = controlBackground()
    }
    controls.addView(hint, FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.WRAP_CONTENT,
      FrameLayout.LayoutParams.WRAP_CONTENT,
      Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL,
    ))
    setContentView(root)
    WindowCompat.getInsetsController(window, root).apply {
      isAppearanceLightStatusBars = false
      isAppearanceLightNavigationBars = false
    }
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density + 0.5f).toInt()

  private fun controlBackground() = GradientDrawable().apply {
    setColor(0xc7000000.toInt())
    cornerRadius = dp(22).toFloat()
  }

  private fun startCamera() {
    if (didFinish || isFinishing || isDestroyed) return
    val cameraProviderFuture = try {
      ProcessCameraProvider.getInstance(this)
    } catch (error: RuntimeException) {
      finishWithResult(RESULT_CAMERA_FAILED)
      return
    }
    cameraProviderFuture.addListener(
      {
        if (!didFinish && !isFinishing && !isDestroyed) {
          try {
            bindCamera(cameraProviderFuture.get())
          } catch (error: Exception) {
            finishWithResult(RESULT_CAMERA_FAILED)
          }
        }
      },
      ContextCompat.getMainExecutor(this),
    )
  }

  private fun bindCamera(cameraProvider: ProcessCameraProvider) {
    val preview = Preview.Builder().build().also {
      it.setSurfaceProvider(previewView.surfaceProvider)
    }
    val qrAnalyzer = QRAnalyzer(::finishWithValue)
    analyzer = qrAnalyzer
    val imageAnalysis = ImageAnalysis.Builder()
      .setTargetResolution(Size(1280, 720))
      .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
      .build()
    analysis = imageAnalysis
    imageAnalysis.setAnalyzer(cameraExecutor, qrAnalyzer)

    val camera = cameraProvider.bindToLifecycle(
      this,
      CameraSelector.DEFAULT_BACK_CAMERA,
      preview,
      imageAnalysis,
    )
    camera.cameraInfo.cameraState.observe(this) { state ->
      if (state.error != null) finishWithResult(RESULT_CAMERA_FAILED)
    }
  }

  private fun finishWithValue(value: String) {
    finishWithResult(
      Activity.RESULT_OK,
      Intent().putExtra(EXTRA_QR_VALUE, value),
    )
  }

  private fun finishWithResult(result: Int, data: Intent? = null) {
    if (didFinish || isFinishing || isDestroyed) return
    didFinish = true
    setResult(result, data)
    finish()
  }

  private class QRAnalyzer(
    private val onQRCode: (String) -> Unit,
  ) : ImageAnalysis.Analyzer {
    private val scanner = BarcodeScanning.getClient(
      BarcodeScannerOptions.Builder()
        .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
        .build(),
    )

    fun close() = scanner.close()

    override fun analyze(imageProxy: ImageProxy) {
      val mediaImage = imageProxy.image
      if (mediaImage == null) {
        imageProxy.close()
        return
      }

      val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
      scanner.process(image)
        .addOnSuccessListener { barcodes ->
          val value = barcodes.firstNotNullOfOrNull { it.rawValue?.takeIf(String::isNotBlank) }
          if (value != null) {
            onQRCode(value)
          }
        }
        .addOnCompleteListener {
          imageProxy.close()
        }
    }
  }

  companion object {
    private const val TAG = "MiaoxunQRCodeScanner"
    const val EXTRA_QR_VALUE = "qr_value"
    const val RESULT_PERMISSION_DENIED = Activity.RESULT_FIRST_USER + 1
    const val RESULT_CAMERA_FAILED = Activity.RESULT_FIRST_USER + 2
  }
}
