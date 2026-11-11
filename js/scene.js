import * as THREE from 'three';
import { GLTFLoader } from './../vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from './../vendor/three/examples/jsm/loaders/DRACOLoader.js';

const PAINT_NAME_RE = /^paint_body|body|paint|carrosserie|lower|nose|cabin|reardeck|fender/i;
const RIM_NAME_RE = /rim|jante|^wheel_/i;
const CARBON_NAME_RE = /carbon|carbone/i;
const GLASS_NAME_RE = /glass|vitre|windshield/i;
const CALIPER_NAME_RE = /caliper|etrier|étrier/i;
const DISC_NAME_RE = /disc|disque/i;
const TIRE_NAME_RE = /tire|tyre|pneu|rubber/i;
const WHEEL_GROUP_RE = /^wheel_/i;

const FALLBACK_ANCHORS = [
  { name: 'Wing_Flap', near: null, pos: [0, 1.3, 1.0] },
  { name: 'Wing_StrutL', near: null, pos: [0.18, 1.12, 0.65] },
  { name: 'Disc_FL', near: 'Caliper_FL', pos: [0, 0, 0] },
];

export function createGT3Scene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x0a0a0a, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 1.1, 5.2);

  const carRoot = new THREE.Group();
  scene.add(carRoot);

  buildGround(scene);
  buildLights(scene);
  scene.environment = buildStudioEnvironment(renderer);

  const state = {
    paintMaterials: new Set(),
    rimMaterials: new Set(),
    wheelGroups: {},
    wingFlapPivot: null,
    carbonParts: {},
    ready: false,
    reducedMotion: false,
  };

  const draco = new DRACOLoader();
  draco.setDecoderPath('vendor/three/examples/jsm/libs/draco/gltf/');
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);

  function load(url, onProgress) {
    return new Promise((resolve, reject) => {
      loader.load(
        url,
        (gltf) => {
          const model = gltf.scene;
          model.traverse((obj) => {
            if (!obj.isMesh) return;
            obj.castShadow = false;
            obj.receiveShadow = false;
            const name = obj.name || '';
            const mat = obj.material;
            if (!mat) return;
            if (PAINT_NAME_RE.test(name) && !GLASS_NAME_RE.test(name)) state.paintMaterials.add(mat);
            if (RIM_NAME_RE.test(name)) state.rimMaterials.add(mat);
            if (CARBON_NAME_RE.test(name)) state.carbonParts[name] = obj;
            if (CALIPER_NAME_RE.test(name)) obj.userData.isCaliper = true;
            if (DISC_NAME_RE.test(name)) obj.userData.isDisc = true;
            if (TIRE_NAME_RE.test(name)) obj.userData.isTire = true;
          });
          model.traverse((obj) => {
            if (WHEEL_GROUP_RE.test(obj.name)) {
              state.wheelGroups[obj.name] = obj;
            }
          });

          for (const fb of FALLBACK_ANCHORS) {
            if (model.getObjectByName(fb.name)) continue;
            const anchor = new THREE.Object3D();
            anchor.name = fb.name;
            if (fb.near) {
              const ref = model.getObjectByName(fb.near);
              if (ref) anchor.position.copy(ref.position);
            } else {
              anchor.position.set(...fb.pos);
            }
            model.add(anchor);
          }

          const flap = model.getObjectByName('Wing_Flap_Pivot');
          if (flap) state.wingFlapPivot = flap;

          carRoot.add(model);
          state.ready = true;
          resolve(model);
        },
        (evt) => {
          if (onProgress && evt.total) onProgress(evt.loaded / evt.total);
        },
        reject
      );
    });
  }

  function buildGround(sc) {
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.65, metalness: 0.05 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    sc.add(ground);

    const shadowTex = buildContactShadowTexture();
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 3.4), shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.002;
    sc.add(shadow);
  }

  function buildContactShadowTexture() {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.05, size / 2, size / 2, size * 0.5);
    grad.addColorStop(0, 'rgba(0,0,0,0.85)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.35)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function buildLights(sc) {
    const key = new THREE.DirectionalLight(0xffffff, 0.45);
    key.position.set(4, 6, 3);
    sc.add(key);
    const fill = new THREE.DirectionalLight(0xaecbff, 0.12);
    fill.position.set(-5, 3, -4);
    sc.add(fill);
    sc.add(new THREE.AmbientLight(0x404040, 0.06));
  }

  function buildStudioEnvironment(rend) {
    const pmrem = new THREE.PMREMGenerator(rend);
    pmrem.compileCubemapShader();

    const envScene = new THREE.Scene();
    const dark = new THREE.MeshBasicMaterial({ color: 0x141414, side: THREE.BackSide });
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(30, 32, 32), dark));

    const panel = (w, h, intensity, pos, rotY = 0, rotX = 0) => {
      const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
      m.color.setScalar(intensity);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
      mesh.position.set(...pos);
      mesh.rotation.set(rotX, rotY, 0);
      envScene.add(mesh);
    };

    panel(7, 11, 1.1, [0, 7, -5], 0, -0.25);
    panel(5, 9, 0.7, [-8, 4, 2], Math.PI / 2.3);
    panel(5, 9, 0.7, [8, 4, 2], -Math.PI / 2.3);
    panel(10, 4, 0.3, [0, 0.5, 9], Math.PI);

    const rt = pmrem.fromScene(envScene, 0.02);
    pmrem.dispose();
    return rt.texture;
  }

  function setPaintColor(hex) {
    state.paintMaterials.forEach((m) => m.color.set(hex));
  }

  function setRimColor(hex) {
    state.rimMaterials.forEach((m) => m.color.set(hex));
  }

  function spinWheels(deltaRadians) {
    Object.values(state.wheelGroups).forEach((g) => {
      g.rotation.x += deltaRadians;
    });
  }

  function setWingFlap(t01) {
    if (!state.wingFlapPivot) return;
    const angle = THREE.MathUtils.lerp(0, THREE.MathUtils.degToRad(28), t01);
    state.wingFlapPivot.rotation.z = angle;
  }

  function setCarbonReveal(t01) {
    const names = Object.keys(state.carbonParts);
    if (!names.length) return;
    const activeCount = Math.floor(t01 * names.length + 0.0001);
    names.forEach((n, i) => {
      const obj = state.carbonParts[n];
      const on = i < activeCount;
      const targetEmissive = on ? 0.35 : 0;
      if (obj.material && obj.material.emissive) {
        obj.material.emissiveIntensity = THREE.MathUtils.lerp(obj.material.emissiveIntensity || 0, targetEmissive, 0.3);
      }
    });
  }

  function spinCarHalfTurn() {
    return carRoot.rotation.y + Math.PI;
  }

  function worldPointOf(name) {
    const obj = scene.getObjectByName(name);
    if (!obj) return null;
    const v = new THREE.Vector3();
    obj.getWorldPosition(v);
    return v;
  }

  function projectToScreen(worldVec3) {
    const v = worldVec3.clone().project(camera);
    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    return { x, y, visible: v.z < 1 };
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  let rafId = null;
  let lastTime = performance.now();
  function renderLoop(time) {
    rafId = requestAnimationFrame(renderLoop);
    const dt = Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;
    if (!document.hidden) {
      renderer.render(scene, camera);
    }
  }
  rafId = requestAnimationFrame(renderLoop);

  document.addEventListener('visibilitychange', () => {
    lastTime = performance.now();
  });

  return {
    renderer,
    scene,
    camera,
    carRoot,
    state,
    load,
    setPaintColor,
    setRimColor,
    spinWheels,
    setWingFlap,
    setCarbonReveal,
    spinCarHalfTurn,
    worldPointOf,
    projectToScreen,
    dispose() {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    },
  };
}
