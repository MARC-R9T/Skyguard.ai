import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { geoInterpolate } from 'd3-geo';
import { Conflict, DashboardAnalysis, DensityCell, Flight, HazardZone, MapLayer } from '../types';

interface Airport {
  id: string;
  name: string;
  lat: number;
  lng: number;
  code: string;
}

interface GlobeOptimizedProps {
  flights: Flight[];
  conflicts: Conflict[];
  futureConflicts: Conflict[];
  analysis: DashboardAnalysis | null;
  onFlightClick: (flight: Flight) => void;
  onFlightHover: (flight: Flight | null) => void;
  hoveredFlight: Flight | null;
  selectedFlightId?: string | null;
  onAirportClick?: (airport: Airport) => void;
  activeLayer?: MapLayer;
}

const EARTH_RADIUS = 2;
const ARC_SEGMENTS = 38;
const CONFLICT_ARC_SEGS = 28;
const MARKER_RADIUS = EARTH_RADIUS + 0.03;
const MAX_VISUAL_FLIGHTS = 130;
const MAX_VISUAL_CONFLICT_LINES = 6;
const MAX_VISUAL_FUTURE_CONFLICTS = 10;
const MAX_DENSITY_CELLS = 72;
const MAX_WEATHER_ZONES = 6;
const MAX_TURBULENCE_ZONES = 6;
const EARTH_TEXTURE_URLS = [
  'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
  'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg',
];
const AIRPORTS: Airport[] = [
  { id: 'LHR', name: 'London Heathrow', lat: 51.47, lng: -0.4543, code: 'LHR' },
  { id: 'JFK', name: 'John F. Kennedy', lat: 40.6413, lng: -73.7781, code: 'JFK' },
  { id: 'DXB', name: 'Dubai International', lat: 25.2532, lng: 55.3657, code: 'DXB' },
  { id: 'SIN', name: 'Singapore Changi', lat: 1.3644, lng: 103.9915, code: 'SIN' },
  { id: 'HND', name: 'Tokyo Haneda', lat: 35.5494, lng: 139.7798, code: 'HND' },
  { id: 'LAX', name: 'Los Angeles Intl', lat: 33.9416, lng: -118.4085, code: 'LAX' },
];

const isFiniteNumber = (value: number) => Number.isFinite(value);

const isValidCoordinate = (lat: number, lng: number) =>
  isFiniteNumber(lat) && isFiniteNumber(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

const isValidVector = (point: THREE.Vector3) =>
  isFiniteNumber(point.x) && isFiniteNumber(point.y) && isFiniteNumber(point.z);

const sampleEvenly = <T,>(items: T[], limit: number) => {
  if (limit <= 0 || items.length === 0) return [];
  if (items.length <= limit) return items;

  const step = items.length / limit;
  return Array.from({ length: limit }, (_, index) => items[Math.min(Math.floor(index * step), items.length - 1)]);
};

const createEarthTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext('2d');

  if (!context) {
    return null;
  }

  const ocean = context.createLinearGradient(0, 0, 0, canvas.height);
  ocean.addColorStop(0, '#071a2f');
  ocean.addColorStop(0.45, '#0d3f5f');
  ocean.addColorStop(1, '#061429');
  context.fillStyle = ocean;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const drawLand = (points: Array<[number, number]>, color: string) => {
    context.beginPath();
    points.forEach(([x, y], index) => {
      if (index === 0) context.moveTo(x * canvas.width, y * canvas.height);
      else context.lineTo(x * canvas.width, y * canvas.height);
    });
    context.closePath();
    context.fillStyle = color;
    context.fill();
  };

  context.globalAlpha = 0.82;
  drawLand([[0.13, 0.30], [0.20, 0.18], [0.31, 0.23], [0.35, 0.45], [0.25, 0.58], [0.15, 0.50]], '#526846');
  drawLand([[0.25, 0.55], [0.34, 0.56], [0.36, 0.74], [0.30, 0.92], [0.24, 0.78]], '#41613f');
  drawLand([[0.45, 0.25], [0.58, 0.18], [0.70, 0.30], [0.66, 0.54], [0.50, 0.52]], '#7a704b');
  drawLand([[0.50, 0.52], [0.66, 0.54], [0.64, 0.74], [0.54, 0.78]], '#4f6a43');
  drawLand([[0.70, 0.40], [0.83, 0.36], [0.88, 0.58], [0.75, 0.66]], '#5c6846');
  drawLand([[0.82, 0.72], [0.90, 0.75], [0.92, 0.88], [0.84, 0.90]], '#6f7352');
  drawLand([[0.04, 0.18], [0.11, 0.14], [0.13, 0.25], [0.06, 0.29]], '#3b5e3d');
  context.globalAlpha = 1;

  context.globalAlpha = 0.22;
  context.fillStyle = '#f4f0df';
  for (let index = 0; index < 54; index += 1) {
    const x = ((index * 97) % canvas.width);
    const y = ((index * 53) % canvas.height);
    context.beginPath();
    context.ellipse(x, y, 26 + ((index * 11) % 76), 3 + ((index * 7) % 10), (index % 8) * 0.4, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;

  context.fillStyle = 'rgba(2, 6, 23, 0.08)';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
};

const loadEarthTexture = (urls: string[], onTexture: (texture: THREE.Texture) => void) => {
  let cancelled = false;
  const loader = new THREE.TextureLoader();

  const tryLoad = (index: number) => {
    if (cancelled || index >= urls.length) {
      return;
    }

    loader.load(
      urls[index],
      (texture) => {
        if (cancelled) {
          texture.dispose();
          return;
        }

        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 8;
        texture.needsUpdate = true;
        onTexture(texture);
      },
      undefined,
      () => tryLoad(index + 1),
    );
  };

  tryLoad(0);
  return () => {
    cancelled = true;
  };
};

const latLngToVector3 = (lat: number, lng: number, radius: number) => {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);

  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
};

const buildArcPoints = (start: { lat: number; lng: number }, end: { lat: number; lng: number }, altitudeScale = 0.18, segments = ARC_SEGMENTS) => {
  if (!isValidCoordinate(start.lat, start.lng) || !isValidCoordinate(end.lat, end.lng)) {
    return [];
  }

  const interpolate = geoInterpolate(
    [start.lng, start.lat],
    [end.lng, end.lat],
  );

  const points: THREE.Vector3[] = [];
  for (let step = 0; step <= segments; step++) {
    const progress = step / segments;
    const [lng, lat] = interpolate(progress);
    // sin^1.4 profile: tangential lift-off/landing, no pop-in at endpoints
    const altitude = Math.pow(Math.sin(progress * Math.PI), 1.4) * altitudeScale;
    points.push(latLngToVector3(lat, lng, EARTH_RADIUS + altitude));
  }

  return points.filter(isValidVector);
};

/**
 * Geodesic arc between two 3-D surface positions using SLERP.
 * Curves OVER the globe — never cuts through it.
 * Used only for conflict lines and future-conflict rays (low call count).
 */
const buildSurfaceArc = (v1: THREE.Vector3, v2: THREE.Vector3, lift = 0.08, segs = 48): THREE.Vector3[] => {
  if (!isValidVector(v1) || !isValidVector(v2)) {
    return [];
  }

  const A = v1.clone().normalize();
  const B = v2.clone().normalize();
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const v = new THREE.Vector3().lerpVectors(A, B, t).normalize();
    const h = Math.pow(Math.sin(t * Math.PI), 1.2) * lift;
    pts.push(v.clone().multiplyScalar(EARTH_RADIUS + 0.03 + h));
  }
  return pts.filter(isValidVector);
};

const surfaceNormal = (lat: number, lng: number) =>
  latLngToVector3(lat, lng, EARTH_RADIUS + 0.01).normalize();

const FlightLine: React.FC<{ points: THREE.Vector3[]; color: string; opacity: number }> = ({ points, color, opacity }) => {
  const line = useMemo(() => {
    const safePoints = points.filter(isValidVector);
    if (safePoints.length < 2) {
      return null;
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(safePoints);
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const nextLine = new THREE.Line(geometry, material);
    nextLine.renderOrder = 4;
    return nextLine;
  }, [points, color, opacity]);

  useEffect(() => {
    return () => {
      line?.geometry.dispose();
      if (line?.material instanceof THREE.Material) {
        line.material.dispose();
      }
    };
  }, [line]);

  if (!line) return null;

  return <primitive object={line} />;
};

/**
 * ConflictTube — animated tube geometry with a flowing shader pulse.
 * ONLY used for conflict arcs and future-conflict rays (low count, ~50–150 max).
 * NOT used for normal flight paths — those use cheap FlightLine to protect GPU memory.
 */
const ConflictTube: React.FC<{
  points: THREE.Vector3[];
  color: string;
  opacity: number;
  radius: number;
  speed?: number;
  animated?: boolean;
}> = ({ points, color, opacity, radius, speed = 2.0, animated = true }) => {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const geometry = useMemo(() => {
    const safePoints = points.filter(isValidVector);
    if (safePoints.length < 2) return null;
    const curve = new THREE.CatmullRomCurve3(safePoints, false, 'catmullrom', 0.5);
    return new THREE.TubeGeometry(curve, CONFLICT_ARC_SEGS, radius, 4, false);
  }, [points, radius]);

  useFrame(({ clock }) => {
    if (matRef.current && animated) {
      matRef.current.uniforms.uTime.value = clock.getElapsedTime();
    }
  });

  useEffect(() => () => { geometry?.dispose(); }, [geometry]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry} renderOrder={6}>
      <shaderMaterial
        ref={matRef}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={{
          uTime:  { value: 0 },
          uColor: { value: new THREE.Color(color) },
          uOpacity: { value: opacity },
          uSpeed:   { value: speed },
          uAnimated: { value: animated ? 1.0 : 0.0 },
        }}
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          varying vec2 vUv;
          uniform float uTime;
          uniform vec3  uColor;
          uniform float uOpacity;
          uniform float uSpeed;
          uniform float uAnimated;
          void main() {
            float base = 0.3 + 0.7 * smoothstep(0.0, 0.5, vUv.x);
            float pulse = 0.0;
            if (uAnimated > 0.5) {
              float phase = fract(vUv.x - uTime * uSpeed * 0.07);
              float glow  = smoothstep(0.0, 0.20, phase) * smoothstep(0.38, 0.18, phase);
              float head  = smoothstep(0.0, 0.07, phase) * smoothstep(0.15, 0.06, phase);
              pulse = glow * 0.5 + head * 1.0;
            }
            float rim   = 1.0 - abs(vUv.y * 2.0 - 1.0);
            float alpha = (base + pulse) * uOpacity * (0.45 + 0.55 * rim);
            gl_FragColor = vec4(uColor, clamp(alpha, 0.0, 1.0));
          }
        `}
      />
    </mesh>
  );
};

const surfaceQuaternion = (lat: number, lng: number) =>
  new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    surfaceNormal(lat, lng),
  );

const SurfaceGradientDisc: React.FC<{
  lat: number;
  lng: number;
  radius: number;
  colors: [string, string, string];
  opacities: [number, number, number];
}> = ({ lat, lng, radius, colors, opacities }) => {
  const position = useMemo(
    () => latLngToVector3(lat, lng, EARTH_RADIUS + 0.025),
    [lat, lng],
  );
  const quaternion = useMemo(
    () => surfaceQuaternion(lat, lng),
    [lat, lng],
  );

  return (
    <group position={position} quaternion={quaternion}>
      <mesh>
        <circleGeometry args={[radius, 40]} />
        <meshBasicMaterial color={colors[0]} transparent opacity={opacities[0]} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0, 0.002]}>
        <circleGeometry args={[radius * 0.68, 40]} />
        <meshBasicMaterial color={colors[1]} transparent opacity={opacities[1]} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0, 0.004]}>
        <circleGeometry args={[radius * 0.38, 40]} />
        <meshBasicMaterial color={colors[2]} transparent opacity={opacities[2]} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
};

const RouteAnchorMarker: React.FC<{
  lat: number;
  lng: number;
  kind: 'trail-start' | 'destination';
  emphasized: boolean;
}> = ({ lat, lng, kind, emphasized }) => {
  const position = useMemo(
    () => latLngToVector3(lat, lng, EARTH_RADIUS + 0.026),
    [lat, lng],
  );
  const quaternion = useMemo(
    () => surfaceQuaternion(lat, lng),
    [lat, lng],
  );
  const isDestination = kind === 'destination';
  const ringColor = isDestination ? '#facc15' : '#38bdf8';
  const coreColor = isDestination ? '#fde68a' : '#e0f2fe';
  const ringInnerRadius = isDestination ? 0.024 : 0.018;
  const ringOuterRadius = isDestination ? 0.038 : 0.028;

  return (
    <group position={position} quaternion={quaternion}>
      <mesh>
        <ringGeometry args={[ringInnerRadius, ringOuterRadius, 28]} />
        <meshBasicMaterial
          color={ringColor}
          transparent
          opacity={emphasized ? 0.92 : 0.58}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, 0, 0.002]}>
        <circleGeometry args={[ringInnerRadius * 0.64, 24]} />
        <meshBasicMaterial
          color={coreColor}
          transparent
          opacity={emphasized ? 0.9 : 0.62}
          side={THREE.DoubleSide}
        />
      </mesh>
      {isDestination ? (
        <mesh position={[0, 0, 0.02]} rotation={[0, 0, Math.PI / 4]}>
          <octahedronGeometry args={[emphasized ? 0.016 : 0.013, 0]} />
          <meshBasicMaterial color="#fde047" transparent opacity={0.92} />
        </mesh>
      ) : (
        <mesh position={[0, 0, 0.014]}>
          <sphereGeometry args={[emphasized ? 0.008 : 0.006, 10, 10]} />
          <meshBasicMaterial color="#bae6fd" transparent opacity={0.82} />
        </mesh>
      )}
    </group>
  );
};

const PredictionTrail: React.FC<{ points: { lat: number; lng: number }[]; startPos: { lat: number; lng: number } }> = ({ points, startPos }) => {
  const arcPoints = useMemo(() => {
    if (!isValidCoordinate(startPos.lat, startPos.lng)) return [];
    const safePoints = sampleEvenly(
      points.filter((point) => isValidCoordinate(point.lat, point.lng)),
      6,
    );
    if (safePoints.length === 0) return [];
    // Build proper geodesic segments between each consecutive waypoint
    const all: THREE.Vector3[] = [latLngToVector3(startPos.lat, startPos.lng, MARKER_RADIUS)];
    let prev = startPos;
    for (const p of safePoints) {
      const seg = buildArcPoints(prev, p, 0.06, 10);
      seg.slice(1).forEach(v => all.push(v));
      prev = p;
    }
    return all.filter(isValidVector);
  }, [points, startPos]);

  if (arcPoints.length < 2) return null;

  return (
    <group>
      <FlightLine points={arcPoints} color="#facc15" opacity={0.82} />
      <FlightLine points={arcPoints} color="#fef08a" opacity={0.26} />
    </group>
  );
};

const FlightArc: React.FC<{
  flight: Flight;
  arcPoints: THREE.Vector3[];
  historyPoints: THREE.Vector3[];
  markerPosition: THREE.Vector3;
  routeStart: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  hovered: boolean;
  selected: boolean;
  layerMode: MapLayer;
  onHover: (flight: Flight | null) => void;
  onClick: () => void;
}> = ({ flight, arcPoints, historyPoints, markerPosition, routeStart, destination, hovered, selected, layerMode, onHover, onClick }) => {
  const color = useMemo(() => {
    if (hovered) return '#ffffff';
    if (flight.status === 'conflict') return '#ff3b30';
    if (flight.futureConflict) return '#facc15';
    if (flight.status === 'delayed') return '#ffcc00';
    return '#38bdf8';
  }, [flight.futureConflict, flight.status, hovered]);

  const emphasized = selected || hovered || flight.status === 'conflict' || flight.futureConflict;
  const suppressedByLayer = layerMode !== 'traffic' && !emphasized;
  const pathOpacity = suppressedByLayer
    ? 0.14
    : selected || hovered
      ? 0.96
      : flight.status === 'conflict'
        ? 0.88
        : flight.futureConflict
          ? 0.8
          : flight.status === 'delayed'
            ? 0.62
            : 0.5;
  const historyOpacity = suppressedByLayer ? 0.08 : selected || hovered ? 0.34 : 0.12;
  const markerSize = suppressedByLayer ? 0.017 : selected ? 0.03 : hovered ? 0.028 : flight.status === 'conflict' ? 0.024 : flight.futureConflict ? 0.023 : 0.02;
  const hasDistinctTrailStart = Math.abs(routeStart.lat - flight.origin.lat) > 0.35 || Math.abs(routeStart.lng - flight.origin.lng) > 0.35;
  const showAnchors = selected || hovered;
  const coreColor = hovered ? '#ffffff' : flight.status === 'conflict' ? '#ff5a52' : flight.futureConflict ? '#facc15' : flight.status === 'delayed' ? '#ffcc00' : '#4ea8ff';
  const innerGlowColor = flight.status === 'conflict' ? '#fecaca' : flight.futureConflict ? '#fde68a' : '#dbeafe';

  return (
    <group>
      {(selected || hovered) && historyPoints.length > 1 && (
        <>
          <FlightLine points={historyPoints} color="#60a5fa" opacity={historyOpacity} />
          <FlightLine points={historyPoints} color="#e0f2fe" opacity={historyOpacity * 0.22} />
        </>
      )}

      {/* ── Normal / delayed / hovered path: cheap FlightLine (no GPU cost) ── */}
      {flight.status !== 'conflict' && !flight.futureConflict && (
        <>
          <FlightLine points={arcPoints} color={color} opacity={pathOpacity} />
          <FlightLine
            points={arcPoints}
            color={selected ? '#ffffff' : '#93c5fd'}
            opacity={selected || hovered ? 0.22 : 0.10}
          />
        </>
      )}

      {/* ── Active conflict path: animated ConflictTube ── */}
      {flight.status === 'conflict' && (
        <>
          <FlightLine points={arcPoints} color="#ff3b30" opacity={selected || hovered ? 0.86 : 0.52} />
          <FlightLine points={arcPoints} color="#ffb4ad" opacity={selected || hovered ? 0.18 : 0.08} />
          {(selected || hovered) && (
            <ConflictTube points={arcPoints} color="#ff6b61" opacity={0.38} radius={0.004} speed={2.4} animated />
          )}
        </>
      )}

      {/* ── Future conflict path: animated amber ConflictTube ── */}
      {flight.futureConflict && flight.status !== 'conflict' && (
        <>
          <FlightLine points={arcPoints} color="#facc15" opacity={selected || hovered ? 0.86 : 0.62} />
          <FlightLine points={arcPoints} color="#fef08a" opacity={selected || hovered ? 0.18 : 0.08} />
          {(selected || hovered) && (
            <ConflictTube points={arcPoints} color="#facc15" opacity={0.32} radius={0.004} speed={1.8} animated />
          )}
        </>
      )}

      {flight.prediction && flight.prediction.length > 0 && (
        <PredictionTrail points={flight.prediction} startPos={flight.origin} />
      )}

      {showAnchors && hasDistinctTrailStart && (
        <RouteAnchorMarker
          lat={routeStart.lat}
          lng={routeStart.lng}
          kind="trail-start"
          emphasized={selected || hovered}
        />
      )}
      {showAnchors && (
        <RouteAnchorMarker
          lat={destination.lat}
          lng={destination.lng}
          kind="destination"
          emphasized={selected || hovered || !!flight.futureConflict}
        />
      )}

      <group position={markerPosition}>
        <mesh>
          <sphereGeometry args={[markerSize * 1.65, 14, 14]} />
          <meshBasicMaterial
            color={coreColor}
            transparent
            opacity={selected ? 0.16 : emphasized ? 0.1 : 0.05}
          />
        </mesh>
        <mesh>
          <sphereGeometry args={[markerSize * 1.12, 12, 12]} />
          <meshBasicMaterial
            color={innerGlowColor}
            transparent
            opacity={0.22}
          />
        </mesh>
        <mesh
          onClick={(event) => { event.stopPropagation(); onClick(); }}
          onPointerOver={(event) => { event.stopPropagation(); onHover(flight); document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { onHover(null); document.body.style.cursor = 'auto'; }}
        >
          <sphereGeometry args={[markerSize, 10, 10]} />
          <meshBasicMaterial color={coreColor} transparent opacity={0.98} />
        </mesh>
        <mesh
          onClick={(event) => { event.stopPropagation(); onClick(); }}
          onPointerOver={(event) => { event.stopPropagation(); onHover(flight); document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { onHover(null); document.body.style.cursor = 'auto'; }}
        >
          <sphereGeometry args={[markerSize * 0.42, 10, 10]} />
          <meshBasicMaterial color="#fff7d6" transparent opacity={0.96} />
        </mesh>
        <mesh
          onClick={(event) => { event.stopPropagation(); onClick(); }}
          onPointerOver={(event) => { event.stopPropagation(); onHover(flight); document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { onHover(null); document.body.style.cursor = 'auto'; }}
        >
          <sphereGeometry args={[markerSize * 1.8, 12, 12]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
};

const AirportMarker: React.FC<{
  airport: Airport;
  onClick: () => void;
}> = ({ airport, onClick }) => {
  const position = useMemo(
    () => latLngToVector3(airport.lat, airport.lng, EARTH_RADIUS + 0.02),
    [airport],
  );

  return (
    <group position={position}>
      <mesh
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
        onPointerOver={() => {
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'auto';
        }}
      >
        <sphereGeometry args={[0.026, 10, 10]} />
        <meshBasicMaterial color="#60a5fa" />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.035, 0.05, 20]} />
        <meshBasicMaterial color="#60a5fa" transparent opacity={0.32} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
};

const ConflictLine: React.FC<{ start: THREE.Vector3; end: THREE.Vector3 }> = ({ start, end }) => {
  // Geodesic arc over the globe surface — never cuts through it
  const arcPoints = useMemo(() => buildSurfaceArc(start, end, 0.06, 28), [start, end]);
  return (
    <group>
      <FlightLine points={arcPoints} color="#ff3b30" opacity={0.24} />
      <FlightLine points={arcPoints} color="#ffb4ad" opacity={0.08} />
    </group>
  );
};

const FutureConflictIndicator: React.FC<{
  location: THREE.Vector3;
  firstPoint?: THREE.Vector3 | null;
  secondPoint?: THREE.Vector3 | null;
}> = ({ location, firstPoint, secondPoint }) => {
  const firstArc  = useMemo(() => firstPoint  ? buildSurfaceArc(firstPoint,  location, 0.05, 24) : null, [firstPoint,  location]);
  const secondArc = useMemo(() => secondPoint ? buildSurfaceArc(secondPoint, location, 0.05, 24) : null, [secondPoint, location]);
  const beaconRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (beaconRef.current) {
      const pulse = 0.88 + Math.sin(clock.getElapsedTime() * 4.0) * 0.22;
      beaconRef.current.scale.setScalar(pulse);
    }
  });

  return (
    <group>
      {firstArc && (
        <>
          <FlightLine points={firstArc}  color="#facc15" opacity={0.35} />
          <FlightLine points={firstArc}  color="#fef08a" opacity={0.1} />
        </>
      )}
      {secondArc && (
        <>
          <FlightLine points={secondArc} color="#facc15" opacity={0.35} />
          <FlightLine points={secondArc} color="#fef08a" opacity={0.1} />
        </>
      )}
      <group position={location}>
        <mesh ref={beaconRef}>
          <sphereGeometry args={[0.032, 14, 14]} />
          <meshBasicMaterial color="#fde047" />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.074, 14, 14]} />
          <meshBasicMaterial color="#facc15" transparent opacity={0.10} depthWrite={false} />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.014, 8, 8]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.90} />
        </mesh>
      </group>
    </group>
  );
};

const DensityPlume: React.FC<{ cell: DensityCell }> = ({ cell }) => {
  const { height, baseRadius, topRadius, position, quaternion, outerColor, innerColor, opacity } = useMemo(() => {
    const normal = surfaceNormal(cell.lat, cell.lng);
    const intensity = Math.max(cell.intensity, 0.08);
    const heightValue = 0.06 + (intensity * 0.74);
    const baseRadiusValue = 0.04 + (intensity * 0.16);
    const topRadiusValue = baseRadiusValue * 0.32;
    const base = latLngToVector3(cell.lat, cell.lng, EARTH_RADIUS + 0.03);
    const positionValue = base.clone().add(normal.clone().multiplyScalar(heightValue / 2));
    const innerColorValue = new THREE.Color().lerpColors(
      new THREE.Color('#f97316'),
      new THREE.Color('#ef4444'),
      intensity,
    );
    const outerColorValue = new THREE.Color().lerpColors(
      new THREE.Color('#fdba74'),
      new THREE.Color('#f87171'),
      intensity,
    );

    return {
      height: heightValue,
      baseRadius: baseRadiusValue,
      topRadius: topRadiusValue,
      position: positionValue,
      quaternion: new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        normal,
      ),
      outerColor: outerColorValue.getStyle(),
      innerColor: innerColorValue.getStyle(),
      opacity: 0.08 + (intensity * 0.45),
    };
  }, [cell]);

  return (
    <group>
      <SurfaceGradientDisc
        lat={cell.lat}
        lng={cell.lng}
        radius={baseRadius * 1.7}
        colors={['#f97316', outerColor, innerColor]}
        opacities={[opacity * 0.22, opacity * 0.34, opacity * 0.48]}
      />
      <group position={position} quaternion={quaternion}>
        <mesh>
          <cylinderGeometry args={[topRadius, baseRadius * 0.62, height, 16]} />
          <meshBasicMaterial color={innerColor} transparent opacity={opacity} />
        </mesh>
        <mesh position={[0, height / 2, 0]}>
          <sphereGeometry args={[baseRadius * 0.34, 14, 14]} />
          <meshBasicMaterial color={innerColor} transparent opacity={opacity * 1.05} />
        </mesh>
      </group>
    </group>
  );
};

const WeatherOverlay: React.FC<{ zone: HazardZone }> = ({ zone }) => {
  const { position, quaternion, radius, cloudOffsets } = useMemo(() => ({
    position: latLngToVector3(zone.lat, zone.lng, EARTH_RADIUS + 0.03),
    quaternion: surfaceQuaternion(zone.lat, zone.lng),
    radius: 0.18 + (zone.intensity * 0.26),
    cloudOffsets: [
      { x: -0.14, y: 0.02, z: 0.05, scale: 0.92 },
      { x: -0.04, y: 0.1, z: 0.08, scale: 1.12 },
      { x: 0.09, y: -0.01, z: 0.06, scale: 0.98 },
      { x: 0.18, y: 0.05, z: 0.04, scale: 0.82 },
    ],
  }), [zone]);

  return (
    <group>
      <SurfaceGradientDisc
        lat={zone.lat}
        lng={zone.lng}
        radius={radius * 2.25}
        colors={['#bfdbfe', '#60a5fa', '#eff6ff']}
        opacities={[0.12, 0.2 + (zone.intensity * 0.1), 0.28 + (zone.intensity * 0.14)]}
      />
      <group position={position} quaternion={quaternion}>
        <mesh position={[0, 0, 0.01]}>
          <circleGeometry args={[radius * 1.18, 40]} />
          <meshBasicMaterial color="#dbeafe" transparent opacity={0.14 + (zone.intensity * 0.12)} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, 0, 0.028]} rotation={[0, 0, Math.PI / 8]}>
          <ringGeometry args={[radius * 0.7, radius * 1.08, 36]} />
          <meshBasicMaterial color="#93c5fd" transparent opacity={0.2 + (zone.intensity * 0.12)} side={THREE.DoubleSide} />
        </mesh>
        {cloudOffsets.map((offset, index) => (
          <mesh
            key={`${zone.id}-cloud-${index}`}
            position={[offset.x * radius, offset.y * radius, offset.z + (zone.intensity * 0.04)]}
          >
            <sphereGeometry args={[radius * 0.34 * offset.scale, 18, 18]} />
            <meshBasicMaterial color={index % 2 === 0 ? '#eff6ff' : '#93c5fd'} transparent opacity={0.18 + (zone.intensity * 0.14)} />
          </mesh>
        ))}
      </group>
    </group>
  );
};

const TurbulenceOverlay: React.FC<{ zone: HazardZone }> = ({ zone }) => {
  const { position, quaternion, radius, height, vortices } = useMemo(() => ({
    position: latLngToVector3(zone.lat, zone.lng, EARTH_RADIUS + 0.04),
    quaternion: surfaceQuaternion(zone.lat, zone.lng),
    radius: 0.16 + (zone.intensity * 0.2),
    height: 0.08 + (zone.intensity * 0.14),
    vortices: [
      { x: -0.16, y: 0.02, z: 0.05, rotation: 0.22 },
      { x: 0, y: 0.12, z: 0.1, rotation: -0.18 },
      { x: 0.18, y: -0.01, z: 0.04, rotation: 0.3 },
    ],
  }), [zone]);

  return (
    <group>
      <SurfaceGradientDisc
        lat={zone.lat}
        lng={zone.lng}
        radius={radius * 1.9}
        colors={['#fdba74', '#fb923c', '#f97316']}
        opacities={[0.1, 0.18 + (zone.intensity * 0.1), 0.26 + (zone.intensity * 0.1)]}
      />
      <group position={position} quaternion={quaternion}>
        <mesh position={[0, 0, height * 0.45]} rotation={[Math.PI / 2, 0, Math.PI / 6]}>
          <torusGeometry args={[radius * 0.72, radius * 0.08, 12, 36]} />
          <meshBasicMaterial color="#fdba74" transparent opacity={0.22 + (zone.intensity * 0.12)} />
        </mesh>
        {vortices.map((vortex, index) => (
          <mesh
            key={`${zone.id}-turbulence-${index}`}
            position={[vortex.x * radius, vortex.y * radius, vortex.z + (zone.intensity * 0.05)]}
            rotation={[Math.PI / 2.7, 0, vortex.rotation]}
          >
            <coneGeometry args={[radius * 0.18, height * 1.18, 16]} />
            <meshBasicMaterial color={index === 1 ? '#fb923c' : '#f97316'} transparent opacity={0.24 + (zone.intensity * 0.14)} />
          </mesh>
        ))}
        <mesh position={[0, 0, height * 0.12]}>
          <coneGeometry args={[radius * 0.42, height, 18]} />
          <meshBasicMaterial color="#fb923c" transparent opacity={0.2 + (zone.intensity * 0.1)} />
        </mesh>
      </group>
    </group>
  );
};

const layerGlowColor = (activeLayer: MapLayer) => {
  if (activeLayer === 'weather') return '#60a5fa';
  if (activeLayer === 'turbulence') return '#fb923c';
  if (activeLayer === 'density') return '#f97316';
  return '#3f5f7f';
};

export const GlobeOptimized: React.FC<GlobeOptimizedProps> = ({
  flights,
  conflicts,
  futureConflicts,
  analysis,
  onFlightClick,
  onFlightHover,
  hoveredFlight,
  selectedFlightId,
  onAirportClick,
  activeLayer = 'traffic',
}) => {
  const globeRef = useRef<THREE.Group>(null);
  const fallbackEarthTexture = useMemo(() => createEarthTexture(), []);
  const [remoteEarthTexture, setRemoteEarthTexture] = useState<THREE.Texture | null>(null);
  const earthTexture = remoteEarthTexture ?? fallbackEarthTexture;

  useEffect(() => {
    const cancelLoad = loadEarthTexture(EARTH_TEXTURE_URLS, setRemoteEarthTexture);
    return () => {
      cancelLoad();
    };
  }, []);

  useEffect(() => {
    return () => {
      fallbackEarthTexture?.dispose();
    };
  }, [fallbackEarthTexture]);

  useEffect(() => {
    return () => {
      remoteEarthTexture?.dispose();
    };
  }, [remoteEarthTexture]);

  useFrame(() => {
    if (globeRef.current) {
      globeRef.current.rotation.y += 0.00045;
    }
  });

  const visualFlights = useMemo(() => {
    const validFlights = flights.filter((flight) =>
      isValidCoordinate(flight.origin.lat, flight.origin.lng) &&
      isValidCoordinate(flight.destination.lat, flight.destination.lng)
    );
    if (validFlights.length <= MAX_VISUAL_FLIGHTS) {
      return validFlights;
    }

    const selectedIds = new Set([selectedFlightId, hoveredFlight?.id].filter(Boolean) as string[]);
    const picked = new Set<string>();
    const selected: Flight[] = [];
    const take = (items: Flight[], limit: number) => {
      sampleEvenly(
        items.filter((flight) => !picked.has(flight.id)),
        Math.max(0, Math.min(limit, MAX_VISUAL_FLIGHTS - selected.length)),
      ).forEach((flight) => {
        if (selected.length < MAX_VISUAL_FLIGHTS) {
          selected.push(flight);
          picked.add(flight.id);
        }
      });
    };

    take(validFlights.filter((flight) => selectedIds.has(flight.id)), MAX_VISUAL_FLIGHTS);
    take(validFlights.filter((flight) => flight.status === 'conflict'), 18);
    take(validFlights.filter((flight) => flight.futureConflict), 24);
    take(validFlights.filter((flight) => flight.status !== 'conflict' && !flight.futureConflict), 68);
    take(validFlights.filter((flight) => (flight.prediction?.length ?? 0) > 0), 16);
    take(validFlights.filter((flight) => (flight.delayMinutes ?? 0) > 0), 12);
    take(validFlights, MAX_VISUAL_FLIGHTS);
    return selected;
  }, [flights, hoveredFlight?.id, selectedFlightId]);

  const flightMap = useMemo(
    () => new Map(visualFlights.map((flight) => [flight.id, flight])),
    [visualFlights],
  );

  const flightRenderData = useMemo(
    () => visualFlights.map((flight) => ({
      flight,
      routeStart: flight.history?.[0] ?? flight.origin,
      destination: flight.destination,
      arcPoints: buildArcPoints(
        flight.origin,
        flight.destination,
        flight.status === 'conflict' ? 0.24 : flight.futureConflict ? 0.20 : 0.17,
        ARC_SEGMENTS,
      ),
      historyPoints: sampleEvenly(flight.history ?? [], 8)
        .filter((point) => isValidCoordinate(point.lat, point.lng))
        .map((point) => latLngToVector3(point.lat, point.lng, MARKER_RADIUS - 0.005)),
      markerPosition: latLngToVector3(flight.origin.lat, flight.origin.lng, MARKER_RADIUS),
    })),
    [visualFlights],
  );

  const conflictRenderData = useMemo(
    () => conflicts
      .slice(0, MAX_VISUAL_CONFLICT_LINES)
      .map((conflict) => {
        const firstFlight = flightMap.get(conflict.id1);
        const secondFlight = flightMap.get(conflict.id2);

        if (!firstFlight || !secondFlight) {
          return null;
        }

        return {
          id: conflict.id,
          start: latLngToVector3(firstFlight.origin.lat, firstFlight.origin.lng, MARKER_RADIUS),
          end: latLngToVector3(secondFlight.origin.lat, secondFlight.origin.lng, MARKER_RADIUS),
        };
      })
      .filter((item): item is { id: string; start: THREE.Vector3; end: THREE.Vector3 } => Boolean(item)),
    [conflicts, flightMap],
  );

  const futureConflictRenderData = useMemo(
    () => futureConflicts
      .slice(0, MAX_VISUAL_FUTURE_CONFLICTS)
      .map((conflict) => {
        const firstFlight = flightMap.get(conflict.id1);
        const secondFlight = flightMap.get(conflict.id2);
        const stepIndex = Math.max((conflict.step ?? 1) - 1, 0);
        const firstPrediction = firstFlight?.prediction?.[stepIndex];
        const secondPrediction = secondFlight?.prediction?.[stepIndex];

        if (!firstFlight && !secondFlight) {
          return null;
        }

        return {
          id: conflict.id,
          location: latLngToVector3(conflict.location.lat, conflict.location.lng, MARKER_RADIUS + 0.02),
          firstPoint: firstPrediction
            ? latLngToVector3(firstPrediction.lat, firstPrediction.lng, MARKER_RADIUS + 0.02)
            : firstFlight
              ? latLngToVector3(firstFlight.origin.lat, firstFlight.origin.lng, MARKER_RADIUS)
              : null,
          secondPoint: secondPrediction
            ? latLngToVector3(secondPrediction.lat, secondPrediction.lng, MARKER_RADIUS + 0.02)
            : secondFlight
              ? latLngToVector3(secondFlight.origin.lat, secondFlight.origin.lng, MARKER_RADIUS)
              : null,
        };
      })
      .filter((item): item is { id: string; location: THREE.Vector3; firstPoint: THREE.Vector3 | null; secondPoint: THREE.Vector3 | null } => Boolean(item)),
    [futureConflicts, flightMap],
  );

  const densityCells = useMemo(
    () => (analysis?.density_map ?? []).slice(0, MAX_DENSITY_CELLS),
    [analysis],
  );
  const weatherZones = useMemo(
    () => (analysis?.weather_zones ?? []).slice(0, MAX_WEATHER_ZONES),
    [analysis],
  );
  const turbulenceZones = useMemo(
    () => (analysis?.turbulence_zones ?? []).slice(0, MAX_TURBULENCE_ZONES),
    [analysis],
  );

  return (
    <group ref={globeRef}>
      <Stars radius={90} depth={40} count={900} factor={2.8} saturation={0} fade speed={0.35} />

      <Sphere args={[EARTH_RADIUS, 48, 48]}>
        <meshPhongMaterial
          map={earthTexture ?? undefined}
          specular="#284a66"
          shininess={remoteEarthTexture ? 18 : 10}
          color={remoteEarthTexture ? '#ffffff' : '#b7c2a6'}
          emissive="#08111d"
          emissiveIntensity={remoteEarthTexture ? 0.03 : 0.07}
        />
      </Sphere>

      <Sphere args={[2.03, 36, 36]}>
        <meshPhongMaterial
          color={layerGlowColor(activeLayer)}
          transparent
          opacity={activeLayer === 'traffic' ? 0.035 : 0.11}
          side={THREE.BackSide}
        />
      </Sphere>

      <Sphere args={[2.11, 32, 32]}>
        <meshBasicMaterial color="#d8ecff" transparent opacity={0.018} side={THREE.DoubleSide} />
      </Sphere>

      {activeLayer === 'density' && densityCells.map((cell) => (
        <DensityPlume key={`${cell.lat}-${cell.lng}`} cell={cell} />
      ))}

      {activeLayer === 'weather' && weatherZones.map((zone) => (
        <WeatherOverlay key={zone.id} zone={zone} />
      ))}

      {activeLayer === 'turbulence' && turbulenceZones.map((zone) => (
        <TurbulenceOverlay key={zone.id} zone={zone} />
      ))}

      {flightRenderData.map(({ flight, arcPoints, historyPoints, markerPosition, routeStart, destination }) => (
        <FlightArc
          key={flight.id}
          flight={flight}
          arcPoints={arcPoints}
          historyPoints={historyPoints}
          markerPosition={markerPosition}
          routeStart={routeStart}
          destination={destination}
          hovered={hoveredFlight?.id === flight.id}
          selected={selectedFlightId === flight.id}
          layerMode={activeLayer}
          onHover={onFlightHover}
          onClick={() => onFlightClick(flight)}
        />
      ))}

      {activeLayer === 'traffic' && AIRPORTS.map((airport) => (
        <AirportMarker
          key={airport.id}
          airport={airport}
          onClick={() => onAirportClick?.(airport)}
        />
      ))}

      {conflictRenderData.map((conflict) => (
        <ConflictLine
          key={conflict.id}
          start={conflict.start}
          end={conflict.end}
        />
      ))}

      {futureConflictRenderData.map((conflict) => (
        <FutureConflictIndicator
          key={conflict.id}
          location={conflict.location}
          firstPoint={conflict.firstPoint}
          secondPoint={conflict.secondPoint}
        />
      ))}

      <ambientLight intensity={0.92} />
      <pointLight position={[10, 8, 12]} intensity={1.2} color="#fff4d6" />
      <spotLight position={[-12, 10, 10]} angle={0.2} penumbra={1} intensity={0.72} color="#dcecff" />
    </group>
  );
};
