import {
  Box3,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  PerspectiveCamera,
  Scene,
  Sphere,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D,
  type Texture,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

interface RendererLike {
  setPixelRatio(value: number): void;
  setSize(width: number, height: number, updateStyle: boolean): void;
  render(scene: Scene, camera: PerspectiveCamera): void;
  dispose(): void;
}

interface LoaderLike {
  loadAsync(url: string): Promise<{ scene: Object3D }>;
}

interface ControlsLike {
  target: Vector3;
  enableDamping: boolean;
  update(): void;
  dispose(): void;
}

interface ModelSceneDependencies {
  rendererFactory?: (canvas: HTMLCanvasElement) => RendererLike;
  loaderFactory?: () => LoaderLike;
  controlsFactory?: (camera: PerspectiveCamera, canvas: HTMLCanvasElement) => ControlsLike;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (handle: number) => void;
  devicePixelRatio?: () => number;
}

export interface FramingSnapshot {
  radius: number;
  cameraDistance: number;
  aspect: number;
  target: Vector3;
}

const disposeMaterial = (material: Material) => {
  for (const value of Object.values(material)) {
    const texture = value as Texture | undefined;
    if (texture?.isTexture) texture.dispose();
  }
  material.dispose();
};

const disposeObject = (root: Object3D | null) => {
  if (!root) return;
  root.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    child.geometry?.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) disposeMaterial(material);
  });
  root.removeFromParent();
};

const defaultRendererFactory = (canvas: HTMLCanvasElement): RendererLike => {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
  });
  renderer.outputColorSpace = SRGBColorSpace;
  return renderer;
};

export function createModelScene(
  canvas: HTMLCanvasElement,
  {
    rendererFactory = defaultRendererFactory,
    loaderFactory = () => new GLTFLoader(),
    controlsFactory = (camera, targetCanvas) => new OrbitControls(camera, targetCanvas),
    requestFrame = requestAnimationFrame,
    cancelFrame = cancelAnimationFrame,
    devicePixelRatio = () => window.devicePixelRatio || 1,
  }: ModelSceneDependencies = {},
) {
  const scene = new Scene();
  scene.background = new Color("#1b2422");
  const camera = new PerspectiveCamera(34, 1, 0.01, 1000);
  const renderer = rendererFactory(canvas);
  renderer.setPixelRatio(Math.min(2, Math.max(1, devicePixelRatio())));
  const controls = controlsFactory(camera, canvas);
  controls.enableDamping = true;
  scene.add(new HemisphereLight(0xeaf4f1, 0x1b2422, 2.2));
  const keyLight = new DirectionalLight(0xffffff, 3.1);
  keyLight.position.set(4, 6, 5);
  scene.add(keyLight);
  const fillLight = new DirectionalLight(0x72c8ba, 1.1);
  fillLight.position.set(-5, 2, -3);
  scene.add(fillLight);

  let currentModel: Object3D | null = null;
  let frameHandle = 0;
  let disposed = false;
  let loadVersion = 0;
  let radius = 0;
  let homePosition = new Vector3(0, 0, 3);
  let homeTarget = new Vector3();

  const resize = (width = canvas.clientWidth, height = canvas.clientHeight) => {
    const safeWidth = Math.max(1, Math.floor(width));
    const safeHeight = Math.max(1, Math.floor(height));
    camera.aspect = safeWidth / safeHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(safeWidth, safeHeight, false);
  };

  const frameModel = (model: Object3D) => {
    model.updateMatrixWorld(true);
    const initialBox = new Box3().setFromObject(model);
    if (initialBox.isEmpty()) throw new Error("Model bounds are empty");
    const center = initialBox.getCenter(new Vector3());
    model.position.sub(center);
    model.updateMatrixWorld(true);
    const box = new Box3().setFromObject(model);
    const sphere = box.getBoundingSphere(new Sphere());
    radius = Math.max(sphere.radius, 0.01);
    homeTarget = new Vector3(0, 0, 0);
    homePosition = new Vector3(radius * 1.45, radius * 0.45, radius * 2.7);
    camera.near = Math.max(0.01, radius / 100);
    camera.far = Math.max(100, radius * 30);
    camera.updateProjectionMatrix();
    camera.position.copy(homePosition);
    camera.lookAt(homeTarget);
    controls.target.copy(homeTarget);
    controls.update();
  };

  const load = async (url: string) => {
    const version = ++loadVersion;
    const loaded = await loaderFactory().loadAsync(url);
    if (disposed || version !== loadVersion) {
      disposeObject(loaded.scene);
      return;
    }
    disposeObject(currentModel);
    currentModel = loaded.scene;
    frameModel(currentModel);
    scene.add(currentModel);
  };

  const resetCamera = () => {
    camera.position.copy(homePosition);
    camera.lookAt(homeTarget);
    controls.target.copy(homeTarget);
    controls.update();
  };

  const renderFrame: FrameRequestCallback = () => {
    if (disposed) return;
    controls.update();
    renderer.render(scene, camera);
    frameHandle = requestFrame(renderFrame);
  };

  resize();
  frameHandle = requestFrame(renderFrame);

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    loadVersion += 1;
    cancelFrame(frameHandle);
    disposeObject(currentModel);
    currentModel = null;
    controls.dispose();
    renderer.dispose();
  };

  const getFramingSnapshot = (): FramingSnapshot => ({
    radius,
    cameraDistance: camera.position.distanceTo(controls.target),
    aspect: camera.aspect,
    target: controls.target.clone(),
  });

  return { load, resetCamera, resize, dispose, getFramingSnapshot };
}

export type ModelScene = ReturnType<typeof createModelScene>;
