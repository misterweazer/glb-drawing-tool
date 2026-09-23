import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/loaders/GLTFLoader.js';

const viewport = document.getElementById('viewport');
const fileInput = document.getElementById('fileInput');
const statusEl = document.getElementById('status');
const objectsEl = document.getElementById('objects');
const modelInfoEl = document.getElementById('modelInfo');
const buttons = [...document.querySelectorAll('[data-view]')];

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd1d5db);

const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100000);
camera.position.set(4, 3, 5);

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
  camera.aspect = w / h;
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

function show3D() {
  currentView = '3d';
  camera.isPerspectiveCamera = true;
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
