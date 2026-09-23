/**
 * 3D VIEW of the virtual mine — Spec §4, §5, §204.
 *
 * The mesh is built from `terrainElevation()`, the same function the plan view
 * and profile call. Nothing here is modelled by hand, so the views cannot
 * drift apart.
 */

import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import {
  featureRl,
  MINE_EXTENT,
  MINE_FEATURES,
  terrainElevation,
  type MineFeature,
} from '../../data/mine';

const FEATURE_COLOR: Record<string, string> = {
  monument: '#e6edf3',
  gcp: '#e2703a',
  checkpoint: '#4ec9a5',
  launch: '#62a8e5',
  building: '#9aa8b8',
  crusher: '#9aa8b8',
  powerline: '#e9b949',
  water: '#3b7ea1',
  hemm: '#e5645f',
  exclusion: '#e5645f',
  stockpile: '#b09a56',
  dump: '#8d7a4e',
};

function buildTerrainGeometry(segments: number): THREE.BufferGeometry {
  const width = MINE_EXTENT.eMax - MINE_EXTENT.eMin;
  const depth = MINE_EXTENT.nMax - MINE_EXTENT.nMin;
  const geometry = new THREE.PlaneGeometry(width, depth, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  const position = geometry.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(position.count * 3);

  let minRl = Infinity;
  let maxRl = -Infinity;
  const rls = new Float32Array(position.count);

  for (let i = 0; i < position.count; i++) {
    // Plane is centred on the origin; shift into local grid coordinates.
    const e = position.getX(i) + width / 2 + MINE_EXTENT.eMin;
    const n = position.getZ(i) + depth / 2 + MINE_EXTENT.nMin;
    const rl = terrainElevation(e, n);
    rls[i] = rl;
    position.setY(i, rl);
    if (rl < minRl) minRl = rl;
    if (rl > maxRl) maxRl = rl;
  }

  const low = new THREE.Color('#2d4a5c');
  const mid = new THREE.Color('#6b7f5a');
  const high = new THREE.Color('#b8a672');
  const tmp = new THREE.Color();

  for (let i = 0; i < position.count; i++) {
    const t = (rls[i]! - minRl) / (maxRl - minRl || 1);
    if (t < 0.5) tmp.copy(low).lerp(mid, t * 2);
    else tmp.copy(mid).lerp(high, (t - 0.5) * 2);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function Terrain({ segments, wireframe }: { segments: number; wireframe: boolean }) {
  const geometry = useMemo(() => buildTerrainGeometry(segments), [segments]);
  const width = MINE_EXTENT.eMax - MINE_EXTENT.eMin;
  const depth = MINE_EXTENT.nMax - MINE_EXTENT.nMin;

  return (
    <mesh
      geometry={geometry}
      position={[MINE_EXTENT.eMin + width / 2, 0, MINE_EXTENT.nMin + depth / 2]}
      receiveShadow
    >
      <meshStandardMaterial
        vertexColors
        wireframe={wireframe}
        roughness={0.95}
        metalness={0}
        flatShading
      />
    </mesh>
  );
}

function FeatureMarker({
  feature,
  onSelect,
  selected,
}: {
  feature: MineFeature;
  onSelect: (f: MineFeature) => void;
  selected: boolean;
}) {
  const rl = featureRl(feature);
  const color = FEATURE_COLOR[feature.kind] ?? '#e6edf3';

  return (
    <group position={[feature.e, rl, feature.n]}>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onSelect(feature);
        }}
      >
        <sphereGeometry args={[selected ? 14 : 9, 12, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={selected ? 0.7 : 0.25} />
      </mesh>
      {selected ? (
        <Html distanceFactor={900} style={{ pointerEvents: 'none' }}>
          <div
            style={{
              background: 'var(--c-surface)',
              border: '1px solid var(--c-accent)',
              borderRadius: 4,
              padding: '2px 8px',
              fontSize: 12,
              whiteSpace: 'nowrap',
              color: 'var(--c-text)',
            }}
          >
            {feature.id}
          </div>
        </Html>
      ) : null}
    </group>
  );
}

/** Section line drawn in the 3D scene so it matches the profile view exactly. */
function SectionLine({ from, to }: { from: { e: number; n: number }; to: { e: number; n: number } }) {
  const points = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 120; i++) {
      const t = i / 120;
      const e = from.e + (to.e - from.e) * t;
      const n = from.n + (to.n - from.n) * t;
      pts.push(new THREE.Vector3(e, terrainElevation(e, n) + 3, n));
    }
    return pts;
  }, [from, to]);

  const geometry = useMemo(() => new THREE.BufferGeometry().setFromPoints(points), [points]);

  return (
    <primitive
      object={new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#e2703a' }))}
    />
  );
}

function SlowSpin({ enabled }: { enabled: boolean }) {
  const ref = useRef<{ azimuth: number }>({ azimuth: 0 });
  useFrame((state, delta) => {
    if (!enabled) return;
    ref.current.azimuth += delta * 0.06;
    const r = 1500;
    state.camera.position.x = 800 + r * Math.cos(ref.current.azimuth);
    state.camera.position.z = 700 + r * Math.sin(ref.current.azimuth);
    state.camera.lookAt(700, 470, 700);
  });
  return null;
}

export function MineTerrain({
  segments,
  wireframe,
  spin,
  sectionFrom,
  sectionTo,
  selected,
  onSelect,
}: {
  segments: number;
  wireframe: boolean;
  spin: boolean;
  sectionFrom: { e: number; n: number };
  sectionTo: { e: number; n: number };
  selected: MineFeature | null;
  onSelect: (f: MineFeature) => void;
}) {
  return (
    <Canvas
      camera={{ position: [-500, 900, -300], fov: 45, near: 1, far: 12000 }}
      style={{ height: '100%', width: '100%', background: 'var(--c-bg)' }}
      dpr={[1, 1.75]}
    >
      <hemisphereLight args={['#bcd4e6', '#3a3226', 0.75]} />
      <directionalLight position={[1200, 1600, 600]} intensity={1.6} />
      <fog attach="fog" args={['#0d1117', 2200, 5200]} />

      <Terrain segments={segments} wireframe={wireframe} />
      <SectionLine from={sectionFrom} to={sectionTo} />

      {MINE_FEATURES.map((f) => (
        <FeatureMarker
          key={f.id}
          feature={f}
          onSelect={onSelect}
          selected={selected?.id === f.id}
        />
      ))}

      <gridHelper
        args={[2400, 24, '#2c3744', '#1c242e']}
        position={[800, 380, 700]}
      />
      <axesHelper args={[220]} />

      <SlowSpin enabled={spin} />
      <OrbitControls target={[700, 470, 700]} enableDamping maxPolarAngle={Math.PI / 2.05} />
    </Canvas>
  );
}
