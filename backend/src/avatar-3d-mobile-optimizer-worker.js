import { Logger, NodeIO, Primitive } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  prune,
  quantize,
  simplify,
  textureCompress,
  weld,
} from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import { parentPort, workerData } from "node:worker_threads";
import sharp from "sharp";

const targetTriangleCount = 250_000;
const maximumTextureSize = 2048;

const countTriangles = (document) => document
  .getRoot()
  .listMeshes()
  .flatMap((mesh) => mesh.listPrimitives())
  .reduce((total, primitive) => {
    if (primitive.getMode() !== Primitive.Mode.TRIANGLES) return total;
    const count = primitive.getIndices()?.getCount()
      || primitive.getAttribute("POSITION")?.getCount()
      || 0;
    return total + Math.floor(count / 3);
  }, 0);

const run = async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const document = await io.readBinary(new Uint8Array(workerData));
  document.setLogger(new Logger(Logger.Verbosity.SILENT));

  const sourceTriangleCount = countTriangles(document);
  if (sourceTriangleCount < 1) throw new Error("Avatar mesh is empty.");
  const transforms = [weld()];
  if (sourceTriangleCount > targetTriangleCount) {
    await MeshoptSimplifier.ready;
    transforms.push(simplify({
      error: 0.005,
      ratio: targetTriangleCount / sourceTriangleCount,
      simplifier: MeshoptSimplifier,
    }));
  }
  transforms.push(
    quantize({
      quantizeNormal: 10,
      quantizePosition: 14,
      quantizeTexcoord: 12,
    }),
    textureCompress({
      encoder: sharp,
      resize: [maximumTextureSize, maximumTextureSize],
    }),
    prune(),
  );
  await document.transform(...transforms);
  const mobileTriangleCount = countTriangles(document);
  if (mobileTriangleCount < 1) throw new Error("Optimized avatar mesh is empty.");

  const body = await io.writeBinary(document);
  const transferable = Uint8Array.from(body).buffer;
  parentPort?.postMessage({
    ok: true,
    body: transferable,
    metrics: {
      sourceTriangleCount,
      mobileTriangleCount,
    },
  }, [transferable]);
};

run().catch(() => parentPort?.postMessage({ ok: false }));
