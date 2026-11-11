import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const path = process.argv[2];
const doc = await io.read(path);
const root = doc.getRoot();

console.log('scenes', root.listScenes().length);
console.log('nodes', root.listNodes().length);
console.log('meshes', root.listMeshes().length);
console.log('materials', root.listMaterials().length);
console.log('materials list:', root.listMaterials().map((m) => m.getName()));

const scene = root.listScenes()[0];

function worldBounds() {
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  const matStats = new Map();

  function visit(node, parentMatrix) {
    const local = node.getMatrix();
    const world = multiply(parentMatrix, local);
    const mesh = node.getMesh();
    if (mesh) {
      for (const prim of mesh.listPrimitives()) {
        const mat = prim.getMaterial();
        const name = mat ? mat.getName() : 'NONE';
        const pos = prim.getAttribute('POSITION');
        if (!pos) continue;
        const count = pos.getCount();
        let localMin = [Infinity, Infinity, Infinity];
        let localMax = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < count; i++) {
          const v = pos.getElement(i, []);
          const w = transformPoint(world, v);
          for (let k = 0; k < 3; k++) {
            if (w[k] < localMin[k]) localMin[k] = w[k];
            if (w[k] > localMax[k]) localMax[k] = w[k];
          }
        }
        for (let k = 0; k < 3; k++) {
          if (localMin[k] < min[k]) min[k] = localMin[k];
          if (localMax[k] > max[k]) max[k] = localMax[k];
        }
        if (!matStats.has(name)) matStats.set(name, { count: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
        const s = matStats.get(name);
        s.count++;
        for (let k = 0; k < 3; k++) {
          if (localMin[k] < s.min[k]) s.min[k] = localMin[k];
          if (localMax[k] > s.max[k]) s.max[k] = localMax[k];
        }
      }
    }
    for (const child of node.listChildren()) visit(child, world);
  }

  for (const node of scene.listChildren()) visit(node, identity());
  return { min, max, matStats };
}

function identity() {
  return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
}
function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k*4+r] * b[c*4+k];
      out[c*4+r] = sum;
    }
  }
  return out;
}
function transformPoint(m, p) {
  const [x,y,z] = p;
  return [
    m[0]*x + m[4]*y + m[8]*z + m[12],
    m[1]*x + m[5]*y + m[9]*z + m[13],
    m[2]*x + m[6]*y + m[10]*z + m[14],
  ];
}

console.log('\nComputing world-space bounds (this samples every vertex, may take a bit)...');
const { min, max, matStats } = worldBounds();
console.log('GLOBAL world bbox min', min, 'max', max);
console.log('\nPer-material world bbox:');
for (const [name, s] of matStats) {
  console.log(' ', name, 'primCount=', s.count, 'min=', s.min.map((x) => x.toFixed(3)), 'max=', s.max.map((x) => x.toFixed(3)));
}
