package com.gary.miaoxun.rn

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
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
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.Executors

class QRCodeScannerActivity : ComponentActivity() {
  private val cameraExecutor = Executors.newSingleThreadExecutor()
  private var didFinish = false
  private lateinit var previewView: PreviewView

  private val cameraPermissionLauncher =
    registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
      if (granted) {
        startCamera()
      } else {
        setResult(RESULT_PERMISSION_DENIED)
        finish()
      }
    }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    configureView()

    if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
      startCamera()
    } else {
      cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
    }
  }

  override fun onDestroy() {
    cameraExecutor.shutdown()
    super.onDestroy()
  }

  private fun configureView() {
    val root = FrameLayout(this)
    previewView = PreviewView(this)
    root.addView(
      previewView,
      FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT,
      ),
    )

    val title = TextView(this)
    title.text = "扫描妙讯二维码"
    title.setTextColor(0xffffffff.toInt())
    title.textSize = 18f
    title.gravity = Gravity.CENTER
    root.addView(
      title,
      FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.WRAP_CONTENT,
        Gravity.TOP,
      ).apply {
        topMargin = 56
      },
    )

    val closeButton = Button(this)
    closeButton.text = "关闭"
    closeButton.setOnClickListener {
      setResult(Activity.RESULT_CANCELED)
      finish()
    }
    root.addView(
      closeButton,
      FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.WRAP_CONTENT,
        FrameLayout.LayoutParams.WRAP_CONTENT,
        Gravity.TOP or Gravity.START,
      ).apply {
        topMargin = 44
        leftMargin = 18
      },
    )

    setContentView(root)
  }

  private fun startCamera() {
    val cameraProviderFuture = ProcessCameraProvider.getInstance(this)
    cameraProviderFuture.addListener(
      {
        val cameraProvider = cameraProviderFuture.get()
        val preview = Preview.Builder().build().also {
          it.setSurfaceProvider(previewView.surfaceProvider)
        }
        val imageAnalysis = ImageAnalysis.Builder()
          .setTargetResolution(Size(1280, 720))
          .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
          .build()
          .also {
            it.setAnalyzer(cameraExecutor, QRAnalyzer(::finishWithValue))
          }

        cameraProvider.unbindAll()
        cameraProvider.bindToLifecycle(
          this,
          CameraSelector.DEFAULT_BACK_CAMERA,
          preview,
          imageAnalysis,
        )
      },
      ContextCompat.getMainExecutor(this),
    )
  }

  private fun finishWithValue(value: String) {
    if (didFinish) {
      return
    }
    didFinish = true
    setResult(
      Activity.RESULT_OK,
      Intent().putExtra(EXTRA_QR_VALUE, value),
    )
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
    const val EXTRA_QR_VALUE = "qr_value"
    const val RESULT_PERMISSION_DENIED = Activity.RESULT_FIRST_USER + 1
  }
}
