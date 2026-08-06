import { Accessor, Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const { optimizeAvatarGlbForMobile } = await import(
  "../src/avatar-3d-mobile-optimizer.js"
);
const { validateSelfContainedGlb } = await import("../src/avatar-3d-storage.js");

const createTriangleGlb = async () => {
  const document = new Document();
  const buffer = document.createBuffer();
  const positions = document
    .createAccessor("positions")
    .setType(Accessor.Type.VEC3)
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
    .setBuffer(buffer);
  const indices = document
    .createAccessor("indices")
    .setType(Accessor.Type.SCALAR)
    .setArray(new Uint16Array([0, 1, 2]))
    .setBuffer(buffer);
  const primitive = document
    .createPrimitive()
    .setAttribute("POSITION", positions)
    .setIndices(indices);
  const mesh = document.createMesh("triangle").addPrimitive(primitive);
  const node = document.createNode("triangle").setMesh(mesh);
  document.createScene("scene").addChild(node);
  return Buffer.from(await new NodeIO().writeBinary(document));
};

test("mobile optimizer runs in a worker and emits a self-contained quantized GLB", async () => {
  const source = await createTriangleGlb();
  const result = await optimizeAvatarGlbForMobile(source);

  assert.equal(validateSelfContainedGlb(result.body), true);
  assert.equal(result.metrics.sourceTriangleCount, 1);
  assert.equal(result.metrics.mobileTriangleCount, 1);

  const document = await new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .readBinary(result.body);
  assert.deepEqual(
    document.getRoot().listExtensionsRequired().map((extension) => extension.extensionName),
    ["KHR_mesh_quantization"],
  );
});

test("mobile optimizer rejects an empty source without starting a worker", async () => {
  await assert.rejects(
    () => optimizeAvatarGlbForMobile(Buffer.alloc(0)),
    (error) => error?.details?.code === "MOBILE_MODEL_OPTIMIZATION_FAILED",
  );
});

test("mobile optimizer rejects a GLB without triangle geometry", async () => {
  const document = new Document();
  document.createScene("empty");
  const source = Buffer.from(await new NodeIO().writeBinary(document));

  await assert.rejects(
    () => optimizeAvatarGlbForMobile(source),
    (error) => error?.details?.code === "MOBILE_MODEL_OPTIMIZATION_FAILED",
  );
});

test("mobile optimizer sanitizes worker construction failures", async () => {
  class BrokenWorker {
    constructor() {
      throw new Error("private worker path");
    }
  }

  await assert.rejects(
    () => optimizeAvatarGlbForMobile(Buffer.from("not-empty"), {
      WorkerClass: BrokenWorker,
    }),
    (error) => error?.details?.code === "MOBILE_MODEL_OPTIMIZATION_FAILED"
      && !error.message.includes("private worker path"),
  );
});
