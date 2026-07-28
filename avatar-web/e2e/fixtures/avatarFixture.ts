import { deflateSync } from "node:zlib";

const align4 = (value: number) => (value + 3) & ~3;

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

const pngChunk = (type: string, data: Buffer) => {
  const name = Buffer.from(type, "ascii");
  const content = Buffer.concat([name, data]);
  let crc = 0xffffffff;
  for (const byte of content) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  name.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 8 + data.length);
  return chunk;
};

const createSolidPng = (width: number, height: number) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.alloc(1 + width * 3);
  for (let offset = 1; offset < row.length; offset += 3) row.set([122, 155, 138], offset);
  const pixels = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(pixels)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
};

export const createAvatarGlb = () => {
  const positions = new Float32Array([
    -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
    -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5, -0.5,
  ]);
  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3, 1, 7, 6, 1, 6, 2,
    7, 4, 5, 7, 5, 6, 4, 0, 3, 4, 3, 5,
    3, 2, 6, 3, 6, 5, 4, 7, 1, 4, 1, 0,
  ]);
  const binary = Buffer.alloc(positions.byteLength + indices.byteLength);
  Buffer.from(positions.buffer).copy(binary, 0);
  Buffer.from(indices.buffer).copy(binary, positions.byteLength);

  const node = (name: string, translation: number[], scale: number[]) => ({
    name,
    mesh: 0,
    translation,
    scale,
  });
  const document = {
    asset: { version: "2.0", generator: "Miaoxun E2E fixture" },
    extensionsUsed: ["KHR_materials_unlit"],
    scene: 0,
    scenes: [{ nodes: [0, 1, 2, 3, 4, 5] }],
    nodes: [
      node("head", [0, 1.72, 0], [0.55, 0.55, 0.55]),
      node("torso", [0, 0.68, 0], [0.88, 1.15, 0.48]),
      node("left-arm", [-0.7, 0.68, 0], [0.26, 1.05, 0.3]),
      node("right-arm", [0.7, 0.68, 0], [0.26, 1.05, 0.3]),
      node("left-leg", [-0.28, -0.68, 0], [0.34, 1.45, 0.38]),
      node("right-leg", [0.28, -0.68, 0], [0.34, 1.45, 0.38]),
    ],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 0 },
        indices: 1,
        material: 0,
      }],
    }],
    materials: [{
      pbrMetallicRoughness: {
        baseColorFactor: [0.16, 0.72, 0.62, 1],
        metallicFactor: 0,
        roughnessFactor: 0.72,
      },
      extensions: { KHR_materials_unlit: {} },
    }],
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength, target: 34962 },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength, target: 34963 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 8,
        type: "VEC3",
        min: [-0.5, -0.5, -0.5],
        max: [0.5, 0.5, 0.5],
      },
      { bufferView: 1, componentType: 5123, count: indices.length, type: "SCALAR" },
    ],
  };

  const jsonSource = Buffer.from(JSON.stringify(document));
  const jsonLength = align4(jsonSource.length);
  const binaryLength = align4(binary.length);
  const totalLength = 12 + 8 + jsonLength + 8 + binaryLength;
  const glb = Buffer.alloc(totalLength);
  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(totalLength, 8);
  glb.writeUInt32LE(jsonLength, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  jsonSource.copy(glb, 20);
  glb.fill(0x20, 20 + jsonSource.length, 20 + jsonLength);
  const binaryHeader = 20 + jsonLength;
  glb.writeUInt32LE(binaryLength, binaryHeader);
  glb.writeUInt32LE(0x004e4942, binaryHeader + 4);
  binary.copy(glb, binaryHeader + 8);
  return glb;
};

export const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

export const photoPng = createSolidPng(640, 800);
