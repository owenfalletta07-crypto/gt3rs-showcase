// Generates a stylised placeholder car.glb with the same named-part structure
// we expect a real 992 GT3 RS export to have. Swap assets/car.glb for the real
// model later and update the name map in js/scene.js if mesh names differ.
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import fs from 'node:fs';

// Minimal polyfill: GLTFExporter's binary path reads the merged buffer via FileReader.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      if (this.onloadend) this.onloadend();
    });
  }
};

const root = new THREE.Group();
root.name = 'GT3RS';

const paint = (name, color) => {
  const m = new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.6,
    roughness: 0.35,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
  });
  m.name = name;
  return m;
};

const bodyMat = paint('Paint_Body', 0xd8dadb);
const carbonMat = new THREE.MeshPhysicalMaterial({ color: 0x0a0a0a, roughness: 0.55, metalness: 0.1, clearcoat: 0.3 });
carbonMat.name = 'Carbon_Matte';
const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x15181a, metalness: 0, roughness: 0.05, transmission: 0.7, opacity: 1, transparent: true });
glassMat.name = 'Glass_Tinted';
const rubberMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 0.9 });
rubberMat.name = 'Rubber_Tire';
const rimMat = new THREE.MeshPhysicalMaterial({ color: 0x1b1b1b, metalness: 0.9, roughness: 0.25 });
rimMat.name = 'Rim_Forged';
const caliperMat = new THREE.MeshPhysicalMaterial({ color: 0xd5001c, metalness: 0.3, roughness: 0.4 });
caliperMat.name = 'Caliper_Red';
const discMat = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, metalness: 0.8, roughness: 0.5 });
discMat.name = 'Disc_Steel';
const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6 });
lightMat.name = 'Light_Lens';

function mesh(name, geometry, material, position, rotation, scale) {
  const m = new THREE.Mesh(geometry, material);
  m.name = name;
  if (position) m.position.set(...position);
  if (rotation) m.rotation.set(...rotation);
  if (scale) m.scale.set(...scale);
  root.add(m);
  return m;
}

// --- Body shell (low cabin, wide rear haunches) ---
mesh('Body_Lower', new THREE.BoxGeometry(4.5, 0.5, 1.9, 4, 2, 4), bodyMat, [0, 0.35, 0]);
mesh('Body_Nose', new THREE.BoxGeometry(1.1, 0.55, 1.7, 2, 2, 4), bodyMat, [1.95, 0.45, 0], [0, 0, 0.12]);
mesh('Body_Cabin', new THREE.BoxGeometry(1.9, 0.55, 1.5, 2, 2, 4), bodyMat, [-0.2, 0.85, 0]);
mesh('Body_RearDeck', new THREE.BoxGeometry(1.3, 0.4, 1.85, 2, 2, 4), bodyMat, [-1.9, 0.6, 0]);
mesh('Body_FenderFL', new THREE.BoxGeometry(0.9, 0.3, 0.3, 2, 2, 2), bodyMat, [1.35, 0.35, 0.95]);
mesh('Body_FenderFR', new THREE.BoxGeometry(0.9, 0.3, 0.3, 2, 2, 2), bodyMat, [1.35, 0.35, -0.95]);
mesh('Body_FenderRL', new THREE.BoxGeometry(1.0, 0.35, 0.3, 2, 2, 2), bodyMat, [-1.55, 0.4, 1.02]);
mesh('Body_FenderRR', new THREE.BoxGeometry(1.0, 0.35, 0.3, 2, 2, 2), bodyMat, [-1.55, 0.4, -1.02]);

// --- Glass ---
mesh('Glass_Windshield', new THREE.BoxGeometry(0.9, 0.5, 1.35), glassMat, [0.55, 1.05, 0], [0, 0, -0.35]);
mesh('Glass_Rear', new THREE.BoxGeometry(0.8, 0.45, 1.3), glassMat, [-1.05, 0.95, 0], [0, 0, 0.3]);
mesh('Glass_SideL', new THREE.BoxGeometry(1.5, 0.35, 0.05), glassMat, [-0.2, 0.95, 0.76]);
mesh('Glass_SideR', new THREE.BoxGeometry(1.5, 0.35, 0.05), glassMat, [-0.2, 0.95, -0.76]);

// --- Carbon panels (named individually for the "allègement" section) ---
mesh('Carbon_Roof', new THREE.BoxGeometry(1.7, 0.04, 1.3), carbonMat, [-0.2, 1.14, 0]);
mesh('Carbon_Hood', new THREE.BoxGeometry(1.0, 0.04, 1.5), carbonMat, [2.05, 0.74, 0]);
mesh('Carbon_DoorL', new THREE.BoxGeometry(1.3, 0.5, 0.04), carbonMat, [-0.1, 0.65, 0.96]);
mesh('Carbon_DoorR', new THREE.BoxGeometry(1.3, 0.5, 0.04), carbonMat, [-0.1, 0.65, -0.96]);

// --- Wheels (name pattern Wheel_/Caliper_/Disc_ + FL/FR/RL/RR) ---
const wheelPositions = {
  FL: [1.35, 0.38, 0.98],
  FR: [1.35, 0.38, -0.98],
  RL: [-1.5, 0.4, 1.05],
  RR: [-1.5, 0.4, -1.05],
};
const frontRadius = 0.38;
const rearRadius = 0.42;

for (const [key, pos] of Object.entries(wheelPositions)) {
  const isFront = key.startsWith('F');
  const r = isFront ? frontRadius : rearRadius;
  const width = isFront ? 0.28 : 0.34;
  const wheelGroup = new THREE.Group();
  wheelGroup.name = `Wheel_${key}`;
  wheelGroup.position.set(...pos);
  root.add(wheelGroup);

  const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, width, 24), rubberMat);
  tire.name = `Tire_${key}`;
  tire.rotation.z = Math.PI / 2;
  wheelGroup.add(tire);

  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, width * 1.02, 16), rimMat);
  rim.name = `Rim_${key}`;
  rim.rotation.z = Math.PI / 2;
  wheelGroup.add(rim);

  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, 0.03, 20), discMat);
  disc.name = `Disc_${key}`;
  disc.rotation.z = Math.PI / 2;
  disc.position.x = isFront ? 0.02 : -0.02;
  wheelGroup.add(disc);

  const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.1, r * 0.55, r * 0.3), caliperMat);
  caliper.name = `Caliper_${key}`;
  caliper.position.set(isFront ? 0.08 : -0.08, r * 0.35, 0);
  wheelGroup.add(caliper);
}

// --- Rear wing: swan-neck struts + rotating flap (DRS) ---
const wingGroup = new THREE.Group();
wingGroup.name = 'Wing_Assembly';
wingGroup.position.set(-2.1, 1.12, 0);
root.add(wingGroup);

mesh('Wing_StrutL', new THREE.BoxGeometry(0.07, 0.56, 0.07), carbonMat, [0.2, -0.28, 0.55]);
mesh('Wing_StrutR', new THREE.BoxGeometry(0.07, 0.56, 0.07), carbonMat, [0.2, -0.28, -0.55]);

// Re-parent the two struts we just added at root into wingGroup
for (const name of ['Wing_StrutL', 'Wing_StrutR']) {
  const obj = root.getObjectByName(name);
  root.remove(obj);
  wingGroup.add(obj);
}

const wingFlapPivot = new THREE.Group();
wingFlapPivot.name = 'Wing_Flap_Pivot';
wingFlapPivot.position.set(0.15, 0.02, 0);
wingGroup.add(wingFlapPivot);

const wingFlap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 1.3), carbonMat);
wingFlap.name = 'Wing_Flap';
wingFlap.position.set(0.12, 0, 0);
wingFlapPivot.add(wingFlap);

// --- Front splitter / radiator / side vents (aero section) ---
mesh('Aero_FrontSplitter', new THREE.BoxGeometry(0.35, 0.04, 1.9), carbonMat, [2.5, 0.08, 0]);
mesh('Aero_RadiatorGrille', new THREE.BoxGeometry(0.1, 0.35, 1.2), new THREE.MeshStandardMaterial({ color: 0x050505 }), [2.55, 0.42, 0]);
mesh('Aero_VentL', new THREE.BoxGeometry(0.3, 0.12, 0.05), carbonMat, [-0.65, 0.55, 1.0]);
mesh('Aero_VentR', new THREE.BoxGeometry(0.3, 0.12, 0.05), carbonMat, [-0.65, 0.55, -1.0]);

// --- Mirrors / lights ---
mesh('Mirror_L', new THREE.BoxGeometry(0.18, 0.1, 0.08), carbonMat, [0.95, 0.95, 0.95]);
mesh('Mirror_R', new THREE.BoxGeometry(0.18, 0.1, 0.08), carbonMat, [0.95, 0.95, -0.95]);
mesh('Light_Headlight_L', new THREE.BoxGeometry(0.1, 0.12, 0.3), lightMat, [2.48, 0.55, 0.65]);
mesh('Light_Headlight_R', new THREE.BoxGeometry(0.1, 0.12, 0.3), lightMat, [2.48, 0.55, -0.65]);
mesh('Light_Taillight', new THREE.BoxGeometry(0.08, 0.15, 1.7), lightMat, [-2.42, 0.62, 0]);

const scene = new THREE.Scene();
scene.add(root);

const exporter = new GLTFExporter();
exporter.parse(
  scene,
  (result) => {
    fs.writeFileSync(new URL('../assets/car.glb', import.meta.url), Buffer.from(result));
    console.log('Wrote assets/car.glb', (result.byteLength / 1024).toFixed(1), 'KB');
  },
  (err) => {
    console.error(err);
    process.exit(1);
  },
  { binary: true }
);
