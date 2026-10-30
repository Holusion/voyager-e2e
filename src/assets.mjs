// Synthetic fixtures, generated rather than checked in so every test states what it loads.

/** A color for a second model, told apart from the default orange one by `Explorer.modelCoverage()`. */
export const blue = [0, 0.3, 1, 1];

/**
 * A binary glTF unit cube (2 units wide, centered on the origin) with one flat-colored material.
 * The default color is a saturated orange, easy to tell apart from Voyager's grey-blue backgrounds.
 */
export function cubeGLB({ color = [1, 0.35, 0, 1] } = {}) {
  const positions = [], normals = [], indices = [];
  // One quad per face, so each face gets its own flat normal.
  for (const [axis, sign] of [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]]) {
    const [u, v] = [(axis + 1) % 3, (axis + 2) % 3];
    const first = positions.length / 3;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const position = [0, 0, 0];
      position[axis] = sign;
      position[u] = a;
      position[v] = b * sign; // keeps counter-clockwise winding on both faces of an axis
      positions.push(...position);
      const normal = [0, 0, 0];
      normal[axis] = sign;
      normals.push(...normal);
    }
    indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
  }
  const binary = Buffer.concat([
    Buffer.from(new Float32Array(positions).buffer),
    Buffer.from(new Float32Array(normals).buffer),
    Buffer.from(new Uint16Array(indices).buffer),
  ]);
  const vertexBytes = positions.length * 4;
  const gltf = {
    asset: { version: '2.0', generator: 'voyager-e2e' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    buffers: [{ byteLength: binary.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: vertexBytes, target: 34962 },
      { buffer: 0, byteOffset: vertexBytes, byteLength: vertexBytes, target: 34962 },
      { buffer: 0, byteOffset: 2 * vertexBytes, byteLength: indices.length * 2, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3', min: [-1, -1, -1], max: [1, 1, 1] },
      { bufferView: 1, componentType: 5126, count: normals.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: indices.length, type: 'SCALAR' },
    ],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: color, metallicFactor: 0, roughnessFactor: 1 } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
  };
  return glb(gltf, binary);
}

function glb(gltf, binary) {
  const pad = (buffer, byte) => Buffer.concat([buffer, Buffer.alloc((4 - buffer.length % 4) % 4, byte)]);
  const json = pad(Buffer.from(JSON.stringify(gltf)), 0x20);
  const bin = pad(binary, 0);
  const chunk = (data, type) => {
    const header = Buffer.alloc(8);
    header.writeUInt32LE(data.length, 0);
    header.writeUInt32LE(type, 4);
    return Buffer.concat([header, data]);
  };
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // "glTF"
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
  return Buffer.concat([header, chunk(json, 0x4e4f534a), chunk(bin, 0x004e4942)]);
}

/**
 * A complete Voyager document, as Story would save it (own camera, lights and setup).
 *
 * @param {object} options
 * @param {Array<{derivatives: Record<string, string>, annotations?: object[]}>} options.models
 *   one entry per model, mapping a derivative quality ("Thumb", "Low", "High"...) to an asset URI.
 *   Other properties (e.g. `slicerEnabled`) are copied to the model as they are.
 * @param {Record<string, string>} [options.titles] scene title per language, e.g. `{ EN: "Cube" }`.
 * @param {string} [options.language] the setup's initial language.
 * @param {Array<{id: string, uris: Record<string, string>}>} [options.audio]
 *   audio clips, each mapping a language to an asset URI, e.g. `{ id: 'intro', uris: { EN: 'intro.wav' } }`.
 * @param {string} [options.narration] the id of the clip the main menu plays as the scene's narration.
 * @param {Array<{id: string, titles: Record<string, string>, uris: Record<string, string>}>} [options.articles]
 *   the scene's articles, each mapping a language to its title and to an HTML asset URI.
 * @param {boolean} [options.bare] leave the camera and lights out, as a document made by hand might.
 *   Voyager then provides its own.
 */
export function sceneDocument({ models, titles, language, audio, narration, articles, bare = false }) {
  const meta = {
    ...(titles ? { collection: { titles } } : {}),
    ...(audio ? { audio: audio.map(clip => ({ name: clip.id, captionUris: {}, ...clip })) } : {}),
    ...(articles ? { articles: articles.map(article => ({ uri: Object.values(article.uris)[0], ...article })) } : {}),
  };
  const hasMeta = Object.keys(meta).length > 0;

  const nodes = bare ? [] : [
    { name: 'Camera', camera: 0 },
    { name: 'Lights', children: [2, 3] },
    { name: 'Key', light: 0, rotation: [0.4829741, -0.1070728, 0.1880998, 0.8484633] },
    { name: 'Environment', light: 1 },
  ];
  const sceneNodes = bare ? [] : [0, 1];
  models.forEach((model, index) => {
    sceneNodes.push(nodes.length);
    // Spread models along X so each is visible.
    nodes.push({ name: `Model ${index}`, model: index, translation: [(index - (models.length - 1) / 2) * 3, 0, 0] });
  });

  return {
    asset: { type: 'application/si-dpo-3d.document+json', version: '1.0', generator: 'voyager-e2e' },
    scene: 0,
    scenes: [{ units: 'cm', nodes: sceneNodes, setup: 0, ...(hasMeta ? { meta: 0 } : {}) }],
    nodes,
    ...(bare ? {} : {
      cameras: [{ type: 'perspective', perspective: { yfov: 52, znear: 0.1, zfar: 1000 }, autoNearFar: true }],
      lights: [
        { type: 'directional', color: [1, 1, 1], intensity: 1 },
        { type: 'environment', color: [1, 1, 1], intensity: 1 },
      ],
    }),
    models: models.map(({ derivatives, ...model }) => ({
      units: 'cm',
      derivatives: Object.entries(derivatives).map(([quality, uri]) => ({
        usage: 'Web3D', quality, assets: [{ uri, type: 'Model', mimeType: 'model/gltf-binary' }],
      })),
      ...model,
    })),
    ...(hasMeta ? { metas: [meta] } : {}),
    setups: [{
      units: 'cm',
      interface: { visible: true, logo: false, menu: true, tools: true },
      viewer: { shader: 'Default', toneMapping: false, exposure: 1, gamma: 2, annotationsVisible: false },
      reader: { enabled: false, position: 'Overlay' },
      navigation: { type: 'Orbit', enabled: true, autoZoom: true, lightsFollowCamera: true, autoRotation: false },
      background: { style: 'Solid', color0: [0.2, 0.25, 0.3], color1: [0.2, 0.25, 0.3] },
      floor: { visible: false },
      grid: { visible: false },
      ...(language ? { language: { language } } : {}),
      ...(narration ? { audio: { narrationId: narration } } : {}),
    }],
  };
}

/**
 * A mono 16-bit PCM WAV sine tone. Every browser decodes WAV, and its header gives the duration.
 */
export function toneWAV({ seconds = 10, frequency = 440, sampleRate = 8000 } = {}) {
  const samples = Math.round(seconds * sampleRate);
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0x0fff), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // bytes per second
  header.writeUInt16LE(2, 32); // bytes per frame
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
