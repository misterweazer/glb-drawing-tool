import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const viewport = document.getElementById('viewport');
const fileInput = document.getElementById('fileInput');
const statusEl = document.getElementById('status');
const objectsEl = document.getElementById('objects');
const modelInfoEl = document.getElementById('modelInfo');
const buttons = [...document.querySelectorAll('[data-view]')];

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd1d5db);

const perspectiveCamera = new THREE.PerspectiveCamera(45, 1, 0.01, 100000);
perspectiveCamera.position.set(4, 3, 5);
let camera = perspectiveCamera;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 2.2));
const dir = new THREE.DirectionalLight(0xffffff, 2);
dir.position.set(5, 8, 5);
scene.add(dir);

const grid = new THREE.GridHelper(10, 10);
grid.visible = true;
scene.add(grid);

const loader = new GLTFLoader();
let model = null;
let objects = [];
let currentView = '3d';
let selected = null;

function resize() {
  const w = viewport.clientWidth;
  const h = viewport.clientHeight;
  renderer.setSize(w, h, false);
  if (camera.isPerspectiveCamera) {
    camera.aspect = w / h;
  } else if (camera.isOrthographicCamera) {
    const halfHeight = (camera.top - camera.bottom) / 2;
    const halfWidth = halfHeight * (w / h);
    camera.left = -halfWidth;
    camera.right = halfWidth;
  }
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

function setStatus(text) { statusEl.textContent = text; }

function fmt(n) {
  const v = Math.abs(n) < 1e-8 ? 0 : n;
  return Number(v.toFixed(2)).toString();
}

function clearModel() {
  if (!model) return;
  scene.remove(model);
  model.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const materials = Array.isArray(o.material) ? o.material : [o.material];
      materials.forEach(m => m.dispose?.());
    }
  });
  model = null;
  objects = [];
  selected = null;
  objectsEl.innerHTML = '';
  modelInfoEl.innerHTML = '';
}

function frameModel() {
  if (!model) return;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const distance = maxDim * 1.8 || 10;
  camera.position.copy(center).add(new THREE.Vector3(distance, distance * 0.7, distance));
  camera.near = Math.max(maxDim / 100000, 0.001);
  camera.far = Math.max(maxDim * 20, 100);
  camera.lookAt(center);
  controls.target.copy(center);
  controls.update();
  grid.scale.setScalar(Math.max(maxDim / 10, 1));
}

function makeObjectRow(o, index) {
  const row = document.createElement('div');
  row.className = 'object';

  const name = o.name || 'Mesh ' + index;
  const b = new THREE.Box3().setFromObject(o);
  const s = b.getSize(new THREE.Vector3());

  row.innerHTML =
    '<div class="object-name">' + escapeHtml(name) + '</div>' +
    '<div class="object-size">X ' + fmt(s.x) + ' × Y ' + fmt(s.y) + ' × Z ' + fmt(s.z) + '</div>';

  row.addEventListener('click', () => selectObject(o));
  return row;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
  }[c]));
}

function selectObject(o) {
  if (selected) selected.material?.emissive?.setHex(0x000000);
  selected = o;
  if (selected.material?.emissive) selected.material.emissive.setHex(0x333333);
  setStatus('Выбран: ' + (o.name || 'без имени'));
}

function populateObjects() {
  objectsEl.innerHTML = '';
  objects.forEach((o, i) => objectsEl.appendChild(makeObjectRow(o, i)));

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  modelInfoEl.innerHTML =
    '<b>Модель</b><br>' +
    'Объектов: ' + objects.length + '<br>' +
    'Габарит: X ' + fmt(size.x) + ' × Y ' + fmt(size.y) + ' × Z ' + fmt(size.z);
}


function clearDimensions() {
  const old = scene.getObjectByName('dimensionOverlay');
  if (old) {
    old.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m => {
          if (m.map) m.map.dispose();
          m.dispose?.();
        });
      }
    });
    scene.remove(old);
  }
}

function makeDimensionLabel(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = 'bold 52px Arial';
  ctx.fillStyle = '#111111';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 48);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(120, 22.5, 1);
  sprite.renderOrder = 100;
  sprite.frustumCulled = false;
  return sprite;
}

function addDimLine(group, a, b, label, normal, offset) {
  const start = a.clone().add(normal.clone().multiplyScalar(offset));
  const end = b.clone().add(normal.clone().multiplyScalar(offset));

  const material = new THREE.LineBasicMaterial({
    color: 0x111111,
    depthTest: false,
    depthWrite: false
  });

  const main = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([start, end]),
    material
  );
  main.renderOrder = 100;
  main.frustumCulled = false;
  group.add(main);

  const direction = end.clone().sub(start).normalize();
  let tick;
  if (Math.abs(direction.x) > 0.5) tick = new THREE.Vector3(0, 0, Math.max(offset * 0.18, 8));
  else if (Math.abs(direction.y) > 0.5) tick = new THREE.Vector3(0, 0, Math.max(offset * 0.18, 8));
  else tick = new THREE.Vector3(Math.max(offset * 0.18, 8), 0, 0);

  for (const p of [start, end]) {
    const tickLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        p.clone().sub(tick),
        p.clone().add(tick)
      ]),
      material
    );
    tickLine.renderOrder = 100;
    tickLine.frustumCulled = false;
    group.add(tickLine);
  }

  const label = makeDimensionLabel(label);
  label.position.copy(start).add(end).multiplyScalar(0.5);
  label.position.add(normal.clone().multiplyScalar(Math.max(offset * 0.22, 12)));
  group.add(label);
}

function addOverallDimensions(axis) {
  clearDimensions();
  if (!model) return;

  const box = new THREE.Box3().setFromObject(model);
  const min = box.min;
  const max = box.max;
  const size = box.getSize(new THREE.Vector3());
  const offset = Math.max(Math.max(size.x, size.y, size.z) * 0.12, 10);

  const group = new THREE.Group();
  group.name = 'dimensionOverlay';
  group.renderOrder = 100;
  scene.add(group);

  if (axis === 'front') {
    addDimLine(group,
      new THREE.Vector3(min.x, min.y, min.z),
      new THREE.Vector3(max.x, min.y, min.z),
      fmt(size.x) + ' mm',
      new THREE.Vector3(0, -1, 0), offset);

    addDimLine(group,
      new THREE.Vector3(min.x, min.y, min.z),
      new THREE.Vector3(min.x, min.y, max.z),
      fmt(size.z) + ' mm',
      new THREE.Vector3(-1, 0, 0), offset);
  } else if (axis === 'top') {
    addDimLine(group,
      new THREE.Vector3(min.x, min.y, min.z),
      new THREE.Vector3(max.x, min.y, min.z),
      fmt(size.x) + ' mm',
      new THREE.Vector3(0, 0, -1), offset);

    addDimLine(group,
      new THREE.Vector3(min.x, min.y, min.z),
      new THREE.Vector3(min.x, max.y, min.z),
      fmt(size.y) + ' mm',
      new THREE.Vector3(-1, 0, 0), offset);
  } else {
    addDimLine(group,
      new THREE.Vector3(max.x, min.y, min.z),
      new THREE.Vector3(max.x, max.y, min.z),
      fmt(size.y) + ' mm',
      new THREE.Vector3(1, 0, 0), offset);

    addDimLine(group,
      new THREE.Vector3(max.x, min.y, min.z),
      new THREE.Vector3(max.x, min.y, max.z),
      fmt(size.z) + ' mm',
      new THREE.Vector3(0, 0, 1), offset);
  }
}

function show3D() {
  clearDimensions();
  currentView = '3d';
  camera = perspectiveCamera;
  controls.object = camera;
  camera.position.set(4, 3, 5);
  frameModel();
  controls.enabled = true;
  grid.visible = true;
}

function showOrthographic(axis) {
  if (!model) return;

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const aspect = viewport.clientWidth / viewport.clientHeight;

  const ortho = Math.max(maxDim * 0.65, 1);
  camera = new THREE.OrthographicCamera(
    -ortho * aspect, ortho * aspect, ortho, -ortho, 0.001, maxDim * 20
  );

  if (axis === 'front') {
    camera.position.set(center.x, center.y - maxDim * 2, center.z);
    camera.up.set(0, 0, 1);
  } else if (axis === 'top') {
    camera.position.set(center.x, center.y, center.z + maxDim * 2);
    camera.up.set(0, 1, 0);
  } else {
    camera.position.set(center.x + maxDim * 2, center.y, center.z);
    camera.up.set(0, 0, 1);
  }

  camera.lookAt(center);
  controls.object = camera;
  controls.target.copy(center);
  controls.enabled = false;
  grid.visible = false;
  currentView = axis;
  addOverallDimensions(axis);
}

async function loadFile(file) {
  clearModel();
  setStatus('Загрузка ' + file.name + '…');

  const url = URL.createObjectURL(file);
  try {
    const gltf = await loader.loadAsync(url);
    model = gltf.scene;
    scene.add(model);

    objects = [];
    model.traverse(o => {
      if (o.isMesh) objects.push(o);
    });

    populateObjects();
    show3D();
    setStatus('Загружено: ' + file.name);
  } catch (err) {
    console.error(err);
    setStatus('Ошибка загрузки GLB: ' + err.message);
  } finally {
    URL.revokeObjectURL(url);
  }
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) loadFile(file);
});

buttons.forEach(btn => {
  btn.addEventListener('click', () => {
    buttons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    if (!model) return;
    const view = btn.dataset.view;
    if (view === '3d') show3D();
    else showOrthographic(view);
  });
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();
