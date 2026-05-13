import React, { Suspense, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { GlobeOptimized } from './GlobeOptimized';
import { Conflict, DashboardAnalysis, Flight, MapLayer } from '../types';

const GlobeWrapper = ({
  flights,
  conflicts,
  futureConflicts,
  analysis,
  onFlightClick,
  onAirportClick,
  onFlightHover,
  hoveredFlight,
  scrollYProgress,
  isInteractable,
  selectedTarget,
  selectedFlightId,
  activeLayer,
}: GlobeCanvasProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const { camera } = useThree();

  useFrame(() => {
    if (!groupRef.current) {
      return;
    }

    const progress = scrollYProgress.get();
    let scale = 1;
    if (progress <= 0.15) {
      scale = 1.44 + (progress / 0.15) * 0.18;
    } else if (progress <= 0.5) {
      scale = 1.62 + ((progress - 0.15) / 0.35) * 1.08;
    } else {
      scale = 2.7;
    }
    groupRef.current.scale.setScalar(scale);

    const targetDistance = selectedTarget ? 3.5 : 6;
    const currentDistance = camera.position.length();
    if (Math.abs(currentDistance - targetDistance) > 0.01) {
      const targetPosition = camera.position.clone().normalize().multiplyScalar(targetDistance);
      camera.position.lerp(targetPosition, 0.05);
    }
  });

  return (
    <>
      <group ref={groupRef}>
        <GlobeOptimized
          flights={flights}
          conflicts={conflicts}
          futureConflicts={futureConflicts}
          analysis={analysis}
          onFlightClick={onFlightClick}
          onAirportClick={onAirportClick}
          onFlightHover={onFlightHover}
          hoveredFlight={hoveredFlight}
          selectedFlightId={selectedFlightId}
          activeLayer={activeLayer}
        />
      </group>
      <OrbitControls
        makeDefault
        enabled={isInteractable}
        enablePan={false}
        enableZoom={isInteractable}
        minDistance={2.5}
        maxDistance={12}
        enableDamping
        autoRotate={!selectedTarget && !isInteractable}
        autoRotateSpeed={0.5}
      />
    </>
  );
};

interface GlobeCanvasProps {
  flights: Flight[];
  conflicts: Conflict[];
  futureConflicts: Conflict[];
  analysis: DashboardAnalysis | null;
  onFlightClick: (flight: Flight) => void;
  onAirportClick: (airport: unknown) => void;
  onFlightHover: (flight: Flight | null) => void;
  hoveredFlight: Flight | null;
  scrollYProgress: any;
  isInteractable: boolean;
  selectedTarget: unknown;
  selectedFlightId?: string | null;
  activeLayer: MapLayer;
}

export const GlobeCanvas: React.FC<GlobeCanvasProps> = ({
  flights,
  conflicts,
  futureConflicts,
  analysis,
  onFlightClick,
  onAirportClick,
  onFlightHover,
  hoveredFlight,
  scrollYProgress,
  isInteractable,
  selectedTarget,
  selectedFlightId,
  activeLayer,
}) => {
  return (
    <Canvas
      camera={{ position: [0, 0, 6], fov: 45 }}
      dpr={[0.85, 1.1]}
      gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.setClearColor('#020617', 1);
      }}
      style={{ width: '100vw', height: '100vh', background: '#020617' }}
    >
      <Suspense fallback={null}>
        <GlobeWrapper
          flights={flights}
          conflicts={conflicts}
          futureConflicts={futureConflicts}
          analysis={analysis}
          onFlightClick={onFlightClick}
          onAirportClick={onAirportClick}
          onFlightHover={onFlightHover}
          hoveredFlight={hoveredFlight}
          scrollYProgress={scrollYProgress}
          isInteractable={isInteractable}
          selectedTarget={selectedTarget}
          selectedFlightId={selectedFlightId}
          activeLayer={activeLayer}
        />
      </Suspense>
    </Canvas>
  );
};
