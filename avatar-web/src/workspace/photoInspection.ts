type PhotoInspectionStatus = "checking" | "usable" | "advisory" | "invalid";

export interface PhotoInspection {
  status: PhotoInspectionStatus;
  message: string;
}

interface PhotoMetrics {
  decoded: boolean;
  width: number;
  height: number;
  meanLuma: number;
  edgeEnergy: number;
}

const hardMinimumDimension = 240;
const advisoryMinimumDimension = 640;

export function classifyPhotoMetrics(metrics: PhotoMetrics): PhotoInspection {
  if (!metrics.decoded) return { status: "invalid", message: "照片无法读取" };
  if (Math.min(metrics.width, metrics.height) < hardMinimumDimension) {
    return { status: "invalid", message: "照片分辨率过低" };
  }
  if (Math.min(metrics.width, metrics.height) < advisoryMinimumDimension) {
    return {
      status: "advisory",
      message: "照片可以继续使用；更清晰的正面照会更接近本人",
    };
  }
  if (metrics.meanLuma < 45) {
    return { status: "advisory", message: "画面偏暗，换一张明亮照片效果会更好" };
  }
  if (metrics.meanLuma > 225) {
    return { status: "advisory", message: "画面偏亮，减少强光效果会更好" };
  }
  if (metrics.edgeEnergy < 4) {
    return { status: "advisory", message: "照片仍可继续；清晰展示五官会更接近本人" };
  }
  return { status: "usable", message: "照片可用" };
}

const unsupportedInspection: PhotoInspection = {
  status: "usable",
  message: "照片可用",
};

export async function inspectPhotoFile(file: File): Promise<PhotoInspection> {
  if (typeof globalThis.createImageBitmap !== "function" || typeof document === "undefined") {
    return unsupportedInspection;
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await globalThis.createImageBitmap(file);
    const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return unsupportedInspection;

    context.drawImage(bitmap, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    const previousRow = new Float32Array(width);
    let lumaTotal = 0;
    let edgeTotal = 0;
    let edgeCount = 0;

    for (let y = 0; y < height; y += 1) {
      let leftLuma: number | null = null;
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const luma = pixels[offset] * 0.2126
          + pixels[offset + 1] * 0.7152
          + pixels[offset + 2] * 0.0722;
        lumaTotal += luma;
        if (leftLuma !== null) {
          edgeTotal += Math.abs(luma - leftLuma);
          edgeCount += 1;
        }
        if (y > 0) {
          edgeTotal += Math.abs(luma - previousRow[x]);
          edgeCount += 1;
        }
        previousRow[x] = luma;
        leftLuma = luma;
      }
    }

    return classifyPhotoMetrics({
      decoded: true,
      width: bitmap.width,
      height: bitmap.height,
      meanLuma: lumaTotal / (width * height),
      edgeEnergy: edgeCount ? edgeTotal / edgeCount : 0,
    });
  } catch {
    return classifyPhotoMetrics({
      decoded: false,
      width: 0,
      height: 0,
      meanLuma: 0,
      edgeEnergy: 0,
    });
  } finally {
    bitmap?.close();
  }
}
