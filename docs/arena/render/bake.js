import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const KEPT_ATTRIBUTES = ["position", "normal", "uv"];

function normalize(geometry) {
  const copy = geometry.clone();
  for (const name of Object.keys(copy.attributes)) if (!KEPT_ATTRIBUTES.includes(name)) copy.deleteAttribute(name);
  if (!copy.attributes.uv) copy.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(copy.attributes.position.count * 2), 2));
  return copy.index ? copy.toNonIndexed() : copy;
}

function paint(geometry, color) {
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export function createPartBuilder() {
  const geometries = [];
  const position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3(), euler = new THREE.Euler(), matrix = new THREE.Matrix4();
  return {
    add(geometry, { pos = [0, 0, 0], rot = [0, 0, 0], scale: s = [1, 1, 1], color = 0xffffff } = {}) {
      matrix.compose(position.set(...pos), quaternion.setFromEuler(euler.set(...rot)), scale.set(...s));
      geometries.push(paint(normalize(geometry).applyMatrix4(matrix), new THREE.Color(color)));
      return this;
    },
    build() {
      const merged = mergeGeometries(geometries, false);
      for (const g of geometries) g.dispose();
      geometries.length = 0;
      merged.computeBoundingSphere();
      return merged;
    },
  };
}

export function mergeObjectIntoGeometry(root, { fallbackColor = 0x888888 } = {}) {
  root.updateMatrixWorld(true);
  const geometries = [];
  root.traverse(object => {
    if (!object.isMesh) return;
    const geometry = normalize(object.geometry).applyMatrix4(object.matrixWorld);
    const color = object.material?.color ?? new THREE.Color(fallbackColor);
    geometries.push(paint(geometry, color));
  });
  const merged = mergeGeometries(geometries, false);
  for (const g of geometries) g.dispose();
  merged.computeBoundingSphere();
  return merged;
}

export function mergeStaticMeshes(group, { keep = object => object.userData.keep } = {}) {
  group.updateMatrixWorld(true);
  const buckets = new Map();
  const consumed = [];
  const visit = object => {
    if (keep(object)) return;
    if (object.isMesh && object.visible && !object.isInstancedMesh && !object.isSkinnedMesh) {
      const list = buckets.get(object.material) || [];
      list.push(object);
      buckets.set(object.material, list);
      consumed.push(object);
    }
    for (const child of object.children) visit(child);
  };
  for (const child of group.children) visit(child);
  for (const [material, meshes] of buckets) {
    const geometries = meshes.map(mesh => normalize(mesh.geometry).applyMatrix4(mesh.matrixWorld));
    const merged = mergeGeometries(geometries, false);
    for (const g of geometries) g.dispose();
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, material);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  for (const mesh of consumed) {
    mesh.parent?.remove(mesh);
    mesh.geometry.dispose();
  }
}
