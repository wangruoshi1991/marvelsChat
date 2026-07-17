import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from "three";
import { describe, expect, it, vi } from "vitest";
import { createModelScene } from "./modelScene";

const createModel = (height: number) => {
  const geometry = new BoxGeometry(1, height, 1);
  const material = new MeshStandardMaterial();
  const group = new Group();
  group.add(new Mesh(geometry, material));
  return { group, geometry, material };
};

describe("createModelScene", () => {
  it("replaces old models, frames non-zero bounds, resizes, and disposes every resource once", async () => {
    const first = createModel(2);
    const second = createModel(4);
    const firstGeometryDispose = vi.spyOn(first.geometry, "dispose");
    const firstMaterialDispose = vi.spyOn(first.material, "dispose");
    const secondGeometryDispose = vi.spyOn(second.geometry, "dispose");
    const secondMaterialDispose = vi.spyOn(second.material, "dispose");
    const models = [first.group, second.group];
    const renderer = {
      setPixelRatio: vi.fn(),
      setSize: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    };
    const controls = {
      target: new Vector3(),
      enableDamping: false,
      update: vi.fn(),
      dispose: vi.fn(),
    };
    const canvas = document.createElement("canvas");
    Object.defineProperties(canvas, {
      clientWidth: { value: 400, configurable: true },
      clientHeight: { value: 200, configurable: true },
    });
    const scene = createModelScene(canvas, {
      rendererFactory: () => renderer,
      loaderFactory: () => ({ loadAsync: async () => ({ scene: models.shift()! }) }),
      controlsFactory: () => controls,
      requestFrame: () => 1,
      cancelFrame: vi.fn(),
      devicePixelRatio: () => 3,
    });

    await scene.load("/model-1.glb");
    const firstFrame = scene.getFramingSnapshot();
    expect(firstFrame.radius).toBeGreaterThan(0);
    expect(firstFrame.cameraDistance).toBeGreaterThan(firstFrame.radius);
    expect(firstFrame.target.toArray()).toEqual([0, 0, 0]);

    await scene.load("/model-2.glb");
    expect(firstGeometryDispose).toHaveBeenCalledTimes(1);
    expect(firstMaterialDispose).toHaveBeenCalledTimes(1);

    scene.resize(400, 200);
    expect(renderer.setSize).toHaveBeenLastCalledWith(400, 200, false);
    expect(scene.getFramingSnapshot().aspect).toBe(2);
    expect(renderer.setPixelRatio).toHaveBeenCalledWith(2);

    scene.resetCamera();
    scene.dispose();
    scene.dispose();
    expect(secondGeometryDispose).toHaveBeenCalledTimes(1);
    expect(secondMaterialDispose).toHaveBeenCalledTimes(1);
    expect(controls.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
  });
});
