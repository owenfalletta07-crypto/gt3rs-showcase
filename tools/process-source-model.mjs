import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { flatten, dedup, prune, weld, joinPrimitives, getBounds, simplify } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import fs from 'node:fs';

const srcPath = process.argv[2];
const outPath = process.argv[3];

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(srcPath);
const root = doc.getRoot();

// --- 1. Fix the double unit-scale baked into the FBX->glTF root transform. ---
const fbxNode = root.listNodes().find((n) => n.getName() === 'FINAL_MODEL.fbx');
if (fbxNode) {
  const m = fbxNode.getMatrix();
  const linearIdx = [0, 1, 2, 4, 5, 6, 8, 9, 10];
  fbxNode.setMatrix(m.map((v, i) => (linearIdx.includes(i) ? v * 100 : v)));
  console.log('Fixed FBX root scale node.');
}

// --- 2. Drop Porsche crest / manufacturer-plate geometry entirely. ---
const DROP_MAT = /BadgeA_Material|ManufacturerPlateB_Material/;
let dropped = 0;
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const mat = prim.getMaterial();
    if (mat && DROP_MAT.test(mat.getName())) {
      mesh.removePrimitive(prim);
      prim.dispose();
      dropped++;
    }
  }
}
console.log('Dropped', dropped, 'badge/plate primitives.');

await doc.transform(prune(), flatten(), dedup());

const scene = root.listScenes()[0];
console.log('Body bounds (pre-regroup):', getBounds(scene));

const WHEEL_RE = /_Wheel1A_/;
const CALIPER_RE = /CallipersCalliperA/;

const RENAME = {
  Porsche_911GT3RS992Tribute_2023Paint_Material: 'Paint_Body',
  Porsche_911GT3RS992Tribute_2023Coloured_Material: 'Trim_Coloured',
  Porsche_911GT3RS992Tribute_2023Window_Material: 'Glass_Window',
  RED_GLASS: 'Glass_Tail_Red',
  Porsche_911GT3RS992Tribute_2023Carbon1_Material: 'Carbon_A',
  Porsche_911GT3RS992Tribute_2023Carbon1M_Material: 'Carbon_B',
  Porsche_911GT3RS992Tribute_2023Base_Material: 'Trim_Black',
  Porsche_911GT3RS992Tribute_2023TexturedA_Material: 'Trim_Textured',
  Porsche_911GT3RS992Tribute_2023LightA_Material: 'Light_Lens',
  Porsche_911GT3RS992Tribute_2023InteriorB_Material: 'Interior',
  Porsche_911GT3RS992Tribute_2023Grille1A_Material: 'Grille_1',
  Porsche_911GT3RS992Tribute_2023Grille2A_Material: 'Grille_2',
  Porsche_911GT3RS992Tribute_2023Grille3A_Material: 'Grille_3',
  Porsche_911GT3RS992Tribute_2023Grille4A_Material: 'Grille_4',
  Porsche_911GT3RS992Tribute_2023Grille5A_Material: 'Grille_5',
  Porsche_911GT3RS992Tribute_2023Grille6B_Material: 'Grille_6',
  Porsche_911GT3RS992Tribute_2023Grille7A_Material: 'Grille_7',
  Porsche_911GT3RS992Tribute_2023Grille8A_Material: 'Grille_8',
  Porsche_911GT3RS992Tribute_2023Grille9A_Material: 'Grille_9',
};

function tryJoin(prims, label) {
  if (prims.length === 1) return prims[0];
  try {
    return joinPrimitives(prims);
  } catch (err) {
    console.warn('  joinPrimitives failed for', label, '-', err.message);
    return null;
  }
}

function primCenterZ(prim) {
  const pos = prim.getAttribute('POSITION');
  let min = Infinity;
  let max = -Infinity;
  const v = [0, 0, 0];
  for (let i = 0; i < pos.getCount(); i++) {
    pos.getElement(i, v);
    if (v[2] < min) min = v[2];
    if (v[2] > max) max = v[2];
  }
  return (min + max) / 2;
}

const wheelPrims = [];
// The source stacks both caliper designs on one hub: the larger (front, 6-piston)
// sits behind the axle (z < 0), the smaller (rear) ahead of it (z > 0).
const caliperFrontPrims = [];
const caliperRearPrims = [];
const otherGroups = new Map();
const oldNodes = [];

for (const node of scene.listChildren()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  oldNodes.push(node);
  for (const prim of mesh.listPrimitives()) {
    const mat = prim.getMaterial();
    const matName = mat ? mat.getName() : 'NONE';
    if (WHEEL_RE.test(matName)) {
      wheelPrims.push(prim);
    } else if (CALIPER_RE.test(matName)) {
      (primCenterZ(prim) < 0 ? caliperFrontPrims : caliperRearPrims).push(prim);
    } else {
      if (!otherGroups.has(matName)) otherGroups.set(matName, []);
      otherGroups.get(matName).push(prim);
    }
  }
}

console.log('wheel prims:', wheelPrims.length, 'caliper prims front/rear:', caliperFrontPrims.length, caliperRearPrims.length);

function addGroupNode(name, prims) {
  const joined = tryJoin(prims, name);
  const mesh = doc.createMesh(name);
  if (joined) {
    mesh.addPrimitive(joined);
  } else {
    for (const p of prims) mesh.addPrimitive(p);
  }
  return doc.createNode(name).setMesh(mesh);
}

for (const [matName, prims] of otherGroups) {
  const niceName = RENAME[matName] || matName;
  const node = addGroupNode(niceName, prims);
  scene.addChild(node);
}

const wheelMeshNode = addGroupNode('Wheel_Template', wheelPrims);
const wheelMesh = wheelMeshNode.getMesh();
const caliperFrontNode = addGroupNode('Caliper_Front_Template', caliperFrontPrims);
const caliperRearNode = addGroupNode('Caliper_Rear_Template', caliperRearPrims);

// Estimated wheel-well centers from body proportions (no node-level position
// data survived the source export for individual wheel instances).
const TRACK_X = 0.91;
const FRONT_Z = 1.25;
const REAR_Z = -1.14;
const HUB_Y = 0.365;

const wheelCorners = [
  { key: 'FL', x: -TRACK_X, z: FRONT_Z, mirror: false },
  { key: 'FR', x: TRACK_X, z: FRONT_Z, mirror: true },
  { key: 'RL', x: -TRACK_X, z: REAR_Z, mirror: false },
  { key: 'RR', x: TRACK_X, z: REAR_Z, mirror: true },
];

for (const c of wheelCorners) {
  const wNode = doc
    .createNode(`Wheel_${c.key}`)
    .setMesh(wheelMesh)
    .setTranslation([c.x, HUB_Y, c.z]);
  if (c.mirror) wNode.setScale([-1, 1, 1]);
  scene.addChild(wNode);

  const cNode = doc
    .createNode(`Caliper_${c.key}`)
    .setMesh((c.z === FRONT_Z ? caliperFrontNode : caliperRearNode).getMesh())
    .setTranslation([c.x, HUB_Y, c.z]);
  if (c.mirror) cNode.setScale([-1, 1, 1]);
  scene.addChild(cNode);
}

for (const node of oldNodes) scene.removeChild(node);
scene.removeChild(wheelMeshNode);
scene.removeChild(caliperFrontNode);
scene.removeChild(caliperRearNode);

await doc.transform(
  weld({ tolerance: 0.0001 }),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0.25, error: 0.01 }),
  dedup(),
  prune()
);

const buffer = await io.writeBinary(doc);
fs.writeFileSync(outPath, buffer);
console.log('\nWrote', outPath, (buffer.byteLength / 1024 / 1024).toFixed(2), 'MB');

const finalRoot = doc.getRoot();
console.log('Final nodes:', finalRoot.listNodes().length, 'meshes:', finalRoot.listMeshes().length, 'materials:', finalRoot.listMaterials().length);
console.log('Node names:', finalRoot.listNodes().map((n) => n.getName()));
