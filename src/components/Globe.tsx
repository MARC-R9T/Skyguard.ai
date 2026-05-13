import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, Stars, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { geoInterpolate } from 'd3-geo';
import { Conflict, Flight } from '../types';

interface GlobeProps {
  flights: Flight[];
  conflicts: Conflict[];
  onFlightClick: (flight: Flight) => void;
  onFlightHover: (flight: Flight | null) => void;
  hoveredFlight: Flight | null;
  onAirportClick?: (airport: any) => void;
  activeLayer?: 'traffic' | 'weather' | 'turbulence';
}

export const Globe: React.FC<GlobeProps> = ({ 
  flights,
  conflicts,
  onFlightClick, 
  onFlightHover, 
  hoveredFlight, 
  onAirportClick,
  activeLayer = 'traffic'
}) => {
  const globeRef = useRef<THREE.Group>(null);
  
  const airports = useMemo(() => [
    { id: 'LHR', name: 'London Heathrow', lat: 51.4700, lng: -0.4543, code: 'LHR' },
    { id: 'JFK', name: 'John F. Kennedy', lat: 40.6413, lng: -73.7781, code: 'JFK' },
    { id: 'DXB', name: 'Dubai International', lat: 25.2532, lng: 55.3657, code: 'DXB' },
    { id: 'SIN', name: 'Singapore Changi', lat: 1.3644, lng: 103.9915, code: 'SIN' },
    { id: 'HND', name: 'Tokyo Haneda', lat: 35.5494, lng: 139.7798, code: 'HND' },
    { id: 'LAX', name: 'Los Angeles Intl', lat: 33.9416, lng: -118.4085, code: 'LAX' },
  ], []);
  
  // Using a high-quality night texture for the "live" look
  const [earthTexture] = useTexture([
    'https://unpkg.com/three-globe/example/img/earth-night.jpg'
  ]);

  useFrame(() => {
    if (globeRef.current) {
      globeRef.current.rotation.y += 0.0005;
    }
  });

  const latLngToVector3 = (lat: number, lng: number, radius: number) => {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lng + 180) * (Math.PI / 180);
    return new THREE.Vector3(
      -radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta)
    );
  };

  const flightPaths = useMemo(() => {
    return flights.map(flight => {
      const interpolate = geoInterpolate(
        [flight.origin.lng, flight.origin.lat],
        [flight.destination.lng, flight.destination.lat]
      );
      
      const points = [];
      for (let i = 0; i <= 50; i++) {
        const [lng, lat] = interpolate(i / 50);
        const altitude = Math.sin((i / 50) * Math.PI) * 0.4;
        points.push(latLngToVector3(lat, lng, 2 + altitude));
      }
      
      const curve = new THREE.CatmullRomCurve3(points);
      return { flight, curve };
    });
  }, [flights]);

  return (
    <group ref={globeRef}>
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      
      {/* Earth Sphere */}
      <Sphere args={[2, 64, 64]}>
        <meshPhongMaterial 
          map={earthTexture}
          emissive="#111"
          emissiveIntensity={2}
          specular="#333" 
          shininess={5} 
        />
      </Sphere>

      {/* Atmosphere Glow */}
      <Sphere args={[2.05, 64, 64]}>
        <meshPhongMaterial 
          color={activeLayer === 'weather' ? '#60a5fa' : activeLayer === 'turbulence' ? '#f87171' : '#007aff'}
          transparent
          opacity={activeLayer === 'traffic' ? 0.1 : 0.2}
          side={THREE.BackSide}
        />
      </Sphere>

      {/* Weather/Turbulence Overlay */}
      {activeLayer !== 'traffic' && (
        <LayerOverlay type={activeLayer} />
      )}
      
      {/* Flight Paths */}
      {flightPaths.map(({ flight, curve }) => (
        <FlightPath 
          key={flight.id}
          flight={flight}
          curve={curve}
          hovered={hoveredFlight?.id === flight.id}
          onHover={onFlightHover}
          onClick={() => onFlightClick(flight)}
        />
      ))}

      {/* Airport Hotspots */}
      {airports.map(airport => (
        <AirportMarker 
          key={airport.id} 
          airport={airport} 
          onClick={() => onAirportClick?.(airport)} 
          latLngToVector3={latLngToVector3}
        />
      ))}

      {/* ⚠️ Conflict Lines (Integrated from your conflict_detector.py) */}
      {conflicts.map((conflict, idx) => {
        const f1 = flights.find(f => f.id === conflict.id1);
        const f2 = flights.find(f => f.id === conflict.id2);
        if (!f1 || !f2) return null;
        return (
          <ConflictLine 
            key={`conflict-${idx}`} 
            f1={f1} 
            f2={f2} 
            latLngToVector3={latLngToVector3} 
          />
        );
      })}

      <ambientLight intensity={0.8} />
      <pointLight position={[10, 10, 10]} intensity={2} />
      <spotLight position={[-10, 10, 10]} angle={0.15} penumbra={1} intensity={1} />
    </group>
  );
};

const LayerOverlay: React.FC<{ type: 'weather' | 'turbulence' }> = ({ type }) => {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  
  useFrame(({ clock }) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = clock.getElapsedTime();
    }
  });

  return (
    <Sphere args={[2.1, 64, 64]}>
      <shaderMaterial
        ref={materialRef}
        transparent
        uniforms={{
          uTime: { value: 0 },
          uType: { value: type === 'weather' ? 0 : 1 }
        }}
        vertexShader={`
          varying vec2 vUv;
          varying vec3 vPosition;
          void main() {
            vUv = uv;
            vPosition = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          varying vec2 vUv;
          varying vec3 vPosition;
          uniform float uTime;
          uniform int uType;

          float noise(vec3 p) {
            return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
          }

          void main() {
            float alpha = 0.0;
            vec3 color = vec3(0.0);

            if (uType == 0) { // Weather
              float n = sin(vPosition.x * 2.0 + uTime) * cos(vPosition.y * 2.0 + uTime * 0.5);
              alpha = smoothstep(0.2, 0.8, n);
              color = vec3(0.4, 0.6, 1.0);
            } else { // Turbulence
              float n = noise(vPosition * 1.5 + uTime * 0.2);
              alpha = smoothstep(0.4, 0.9, n);
              color = vec3(1.0, 0.4, 0.2);
            }

            gl_FragColor = vec4(color, alpha * 0.4);
          }
        `}
      />
    </Sphere>
  );
};

const FlightPath: React.FC<{ 
  flight: Flight; 
  curve: THREE.CatmullRomCurve3; 
  hovered: boolean;
  onHover: (f: Flight | null) => void;
  onClick: () => void;
}> = ({ flight, curve, hovered, onHover, onClick }) => {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  
  useFrame(({ clock }) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = clock.getElapsedTime();
    }
  });

  const color = useMemo(() => {
    if (hovered) return new THREE.Color('#ffffff');
    if (flight.status === 'conflict') return new THREE.Color('#ff3b30');
    if (flight.status === 'delayed') return new THREE.Color('#ffcc00');
    return new THREE.Color('#007aff');
  }, [flight.status, hovered]);

  const opacity = hovered ? 1 : (flight.status === 'conflict' ? 1 : 0.6);

  return (
    <group>
      <mesh 
        onClick={onClick}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(flight);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          onHover(null);
          document.body.style.cursor = 'auto';
        }}
      >
        <tubeGeometry args={[curve, 64, hovered ? 0.015 : 0.008, 8, false]} />
        <shaderMaterial
          ref={materialRef}
          transparent
          uniforms={{
            uTime: { value: 0 },
            uColor: { value: color },
            uOpacity: { value: opacity }
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
            uniform vec3 uColor;
            uniform float uOpacity;
            
            void main() {
              // Create a smoother flowing dash effect
              float dash = sin(vUv.x * 30.0 - uTime * 4.0);
              float alpha = smoothstep(-0.2, 0.2, dash) * uOpacity;
              
              // Add a subtle gradient along the path
              alpha *= (0.2 + 0.8 * vUv.x);
              
              // Highlight the "head" of the flow with a smoother transition
              float head = fract(vUv.x - uTime * 0.05);
              alpha += smoothstep(0.9, 1.0, head) * 0.6 * uOpacity;
              
              gl_FragColor = vec4(uColor, alpha);
            }
          `}
        />
      </mesh>
      
      {/* Background glow for conflicts */}
      {flight.status === 'conflict' && (
        <mesh>
          <tubeGeometry args={[curve, 64, 0.02, 8, false]} />
          <meshBasicMaterial color="#ff3b30" transparent opacity={0.15} />
        </mesh>
      )}
      
      <FlightMarker flight={flight} curve={curve} />
      
      {/* 🔮 Predictive Trail (Integrated from your predict.py) */}
      {flight.prediction && flight.prediction.length > 0 && (
        <PredictionTrail points={flight.prediction} startPos={flight.origin} />
      )}
    </group>
  );
};

const AirportMarker: React.FC<{ 
  airport: any; 
  onClick: () => void; 
  latLngToVector3: (lat: number, lng: number, radius: number) => THREE.Vector3 
}> = ({ airport, onClick, latLngToVector3 }) => {
  const pos = useMemo(() => latLngToVector3(airport.lat, airport.lng, 2.02), [airport, latLngToVector3]);
  
  return (
    <group position={pos}>
      <mesh 
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = 'auto'; }}
      >
        <sphereGeometry args={[0.03, 16, 16]} />
        <meshBasicMaterial color="#007aff" />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.04, 0.06, 32]} />
        <meshBasicMaterial color="#007aff" transparent opacity={0.4} side={THREE.DoubleSide} />
      </mesh>
      {/* Pulse effect */}
      <mesh>
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshBasicMaterial color="#007aff" transparent opacity={0.1} />
      </mesh>
    </group>
  );
};

const PredictionTrail: React.FC<{ points: { lat: number; lng: number }[]; startPos: { lat: number; lng: number } }> = ({ points, startPos }) => {
  const curve = useMemo(() => {
    const allPoints = [
      latLngToVector3Static(startPos.lat, startPos.lng, 2.02),
      ...points.map(p => latLngToVector3Static(p.lat, p.lng, 2.02))
    ];
    return new THREE.CatmullRomCurve3(allPoints);
  }, [points, startPos]);

  return (
    <mesh>
      <tubeGeometry args={[curve, 32, 0.005, 8, false]} />
      <meshBasicMaterial color="#4ade80" transparent opacity={0.4} />
    </mesh>
  );
};

const latLngToVector3Static = (lat: number, lng: number, radius: number) => {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
};

const FlightMarker: React.FC<{ flight: Flight; curve: THREE.CatmullRomCurve3 }> = ({ flight, curve }) => {
  const markerRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.PointLight>(null);

  useFrame(({ clock }) => {
    if (markerRef.current) {
      const t = (clock.getElapsedTime() * 0.03) % 1; // Slower, smoother movement
      const pos = curve.getPointAt(t);
      markerRef.current.position.copy(pos);
      
      if (flight.status === 'conflict') {
        const pulse = 1.5 + Math.sin(clock.getElapsedTime() * 12) * 0.8; // More intense pulse
        markerRef.current.scale.setScalar(pulse);
      } else {
        markerRef.current.scale.setScalar(1);
      }

      if (glowRef.current) {
        glowRef.current.position.copy(pos);
        if (flight.status === 'conflict') {
          glowRef.current.intensity = 2 + Math.sin(clock.getElapsedTime() * 12) * 1.5;
        } else {
          glowRef.current.intensity = 0.5;
        }
      }
    }
  });

  return (
    <group>
      <mesh ref={markerRef}>
        <sphereGeometry args={[0.02, 16, 16]} />
        <meshBasicMaterial color="white" />
      </mesh>
      <pointLight 
        ref={glowRef} 
        distance={0.5} 
        intensity={0.5} 
        color={
          flight.status === 'conflict' ? '#ff3b30' : 
          flight.status === 'delayed' ? '#ffcc00' : 
          '#007aff'
        } 
      />
    </group>
  );
};

const ConflictLine: React.FC<{ 
  f1: Flight; 
  f2: Flight; 
  latLngToVector3: (lat: number, lng: number, radius: number) => THREE.Vector3 
}> = ({ f1, f2, latLngToVector3 }) => {
  const materialRef = useRef<THREE.LineBasicMaterial>(null);

  const points = useMemo(() => {
    return [
      latLngToVector3(f1.origin.lat, f1.origin.lng, 2.02),
      latLngToVector3(f2.origin.lat, f2.origin.lng, 2.02)
    ];
  }, [f1, f2, latLngToVector3]);

  useFrame(({ clock }) => {
    if (materialRef.current) {
      materialRef.current.opacity = 0.6 + Math.sin(clock.getElapsedTime() * 10) * 0.4;
    }
  });

  const line = useMemo(() => {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ 
      color: '#ff3b30', 
      transparent: true, 
      opacity: 0.8,
      linewidth: 2 
    });
    return new THREE.Line(geometry, material);
  }, [points]);

  // Update material ref
  useEffect(() => {
    if (line.material instanceof THREE.LineBasicMaterial) {
      (materialRef as any).current = line.material;
    }
  }, [line]);

  return <primitive object={line} />;
};
