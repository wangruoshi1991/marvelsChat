import { describe, expect, it } from "vitest";
import { classifyPhotoMetrics } from "./photoInspection";

describe("classifyPhotoMetrics", () => {
  it("rejects files that cannot be decoded", () => {
    expect(classifyPhotoMetrics({
      decoded: false,
      width: 0,
      height: 0,
      meanLuma: 0,
      edgeEnergy: 0,
    })).toEqual({ status: "invalid", message: "照片无法读取" });
  });

  it("rejects only photos whose short side is below 240 pixels", () => {
    expect(classifyPhotoMetrics({
      decoded: true,
      width: 239,
      height: 800,
      meanLuma: 120,
      edgeEnergy: 20,
    })).toEqual({ status: "invalid", message: "照片分辨率过低" });
  });

  it("keeps lower-resolution photos usable with advice", () => {
    expect(classifyPhotoMetrics({
      decoded: true,
      width: 400,
      height: 800,
      meanLuma: 120,
      edgeEnergy: 20,
    })).toEqual({
      status: "advisory",
      message: "照片可以继续使用；更清晰的正面照会更接近本人",
    });
  });

  it("keeps dark or blurry photos usable but advises the user", () => {
    expect(classifyPhotoMetrics({
      decoded: true,
      width: 1200,
      height: 1800,
      meanLuma: 25,
      edgeEnergy: 20,
    })).toEqual({ status: "advisory", message: "画面偏暗，换一张明亮照片效果会更好" });

    expect(classifyPhotoMetrics({
      decoded: true,
      width: 1200,
      height: 1800,
      meanLuma: 120,
      edgeEnergy: 2,
    })).toEqual({ status: "advisory", message: "照片仍可继续；清晰展示五官会更接近本人" });
  });

  it("accepts a readable, sufficiently detailed photo", () => {
    expect(classifyPhotoMetrics({
      decoded: true,
      width: 1200,
      height: 1800,
      meanLuma: 120,
      edgeEnergy: 20,
    })).toEqual({ status: "usable", message: "照片可用" });
  });
});
