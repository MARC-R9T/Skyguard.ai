import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ShieldAlert, MapPin, Zap, Radar, Plane } from 'lucide-react';
import { cn } from '../lib/utils';
import { Conflict, Flight } from '../types';

interface ConflictSectionProps {
  flights: Flight[];
  conflicts: Conflict[];
  onConflictFocus?: (conflict: Conflict, preferredFlightId: string) => void;
}

const VIEWBOX_SIZE = 100;
const TOP_CONFLICTS = 12;

const riskColorMap = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#3b82f6',
} as const;

const formatDistanceKm = (distanceKm: number) =>
  distanceKm < 0.1 ? `${distanceKm.toFixed(3)} km` : `${distanceKm.toFixed(2)} km`;

const clampRange = (minValue: number, maxValue: number) => {
  if (Number.isFinite(minValue) && Number.isFinite(maxValue) && minValue !== maxValue) {
    return { min: minValue, max: maxValue };
  }

  const pivot = Number.isFinite(minValue) ? minValue : 0;
  return { min: pivot - 1, max: pivot + 1 };
};

type ConflictMapItem = {
  conflict: Conflict;
  firstFlight: Flight;
  secondFlight: Flight;
};

export const ConflictSection: React.FC<ConflictSectionProps> = ({ flights, conflicts, onConflictFocus }) => {
  const firstConflict = conflicts.length > 0 ? conflicts[0] : null;
  const [activeConflictId, setActiveConflictId] = useState<string | null>(firstConflict?.id ?? null);
  const [hoveredConflictId, setHoveredConflictId] = useState<string | null>(null);
  const flightLookup = useMemo(
    () => new Map(flights.map((flight) => [flight.id, flight])),
    [flights],
  );

  const conflictMap = useMemo(() => {
    const items: ConflictMapItem[] = conflicts.slice(0, TOP_CONFLICTS).map((conflict) => {
      const firstFlight = flightLookup.get(conflict.id1);
      const secondFlight = flightLookup.get(conflict.id2);

      return {
        conflict,
        firstFlight,
        secondFlight,
      };
    }).filter((item): item is ConflictMapItem => Boolean(item.firstFlight && item.secondFlight));

    const coordinates = items.flatMap((item) => ([
      item.conflict.location,
      { lat: item.firstFlight.origin.lat, lng: item.firstFlight.origin.lng },
      { lat: item.secondFlight.origin.lat, lng: item.secondFlight.origin.lng },
    ]));

    if (coordinates.length === 0) {
      return {
        items,
        latRange: { min: -1, max: 1 },
        lngRange: { min: -1, max: 1 },
      };
    }

    const latValues = coordinates.map((point) => point.lat);
    const lngValues = coordinates.map((point) => point.lng);
    const rawLatRange = clampRange(Math.min(...latValues), Math.max(...latValues));
    const rawLngRange = clampRange(Math.min(...lngValues), Math.max(...lngValues));
    const latPadding = Math.max((rawLatRange.max - rawLatRange.min) * 0.18, 0.25);
    const lngPadding = Math.max((rawLngRange.max - rawLngRange.min) * 0.18, 0.25);

    return {
      items,
      latRange: {
        min: rawLatRange.min - latPadding,
        max: rawLatRange.max + latPadding,
      },
      lngRange: {
        min: rawLngRange.min - lngPadding,
        max: rawLngRange.max + lngPadding,
      },
    };
  }, [conflicts, flightLookup]);

  useEffect(() => {
    if (conflictMap.items.length === 0) {
      setActiveConflictId(null);
      setHoveredConflictId(null);
      return;
    }

    if (!conflictMap.items.some((item) => item.conflict.id === activeConflictId)) {
      setActiveConflictId(conflictMap.items[0].conflict.id);
    }

    if (hoveredConflictId && !conflictMap.items.some((item) => item.conflict.id === hoveredConflictId)) {
      setHoveredConflictId(null);
    }
  }, [activeConflictId, conflictMap.items, hoveredConflictId]);

  const projectPoint = (lat: number, lng: number) => {
    const x = ((lng - conflictMap.lngRange.min) / (conflictMap.lngRange.max - conflictMap.lngRange.min)) * VIEWBOX_SIZE;
    const y = VIEWBOX_SIZE - (((lat - conflictMap.latRange.min) / (conflictMap.latRange.max - conflictMap.latRange.min)) * VIEWBOX_SIZE);
    return {
      x: Number.isFinite(x) ? x : VIEWBOX_SIZE / 2,
      y: Number.isFinite(y) ? y : VIEWBOX_SIZE / 2,
    };
  };

  const getFlightLabel = (flightId: string) =>
    flightLookup.get(flightId)?.callsign || flightId.toUpperCase();

  const describeConflictLocation = (conflict: Conflict) =>
    `${conflict.location.place} - ${conflict.location.zone}`;

  const activeConflict = conflictMap.items.find((item) => item.conflict.id === activeConflictId) ?? conflictMap.items[0] ?? null;
  const hoveredConflict = conflictMap.items.find((item) => item.conflict.id === hoveredConflictId) ?? null;
  const hoveredConflictPosition = hoveredConflict
    ? projectPoint(hoveredConflict.conflict.location.lat, hoveredConflict.conflict.location.lng)
    : null;

  const highlightedConflict = activeConflict?.conflict ?? firstConflict;

  return (
    <section className="min-h-screen py-24 px-8 max-w-7xl mx-auto relative z-10 overflow-hidden scroll-mt-28">
      <div className="absolute inset-x-0 top-8 bottom-8 rounded-[2.75rem] bg-slate-950 border border-white/8 shadow-[0_32px_120px_rgba(0,0,0,0.62)] pointer-events-none" />
      <div className="absolute inset-x-8 top-12 bottom-12 rounded-[2.5rem] bg-black/45 border border-white/6 pointer-events-none" />
      <div className="absolute inset-0 bg-red-500/8 blur-[120px] rounded-full pointer-events-none" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="mb-16 relative z-10"
      >
        <span className="text-red-500 font-bold tracking-[0.3em] uppercase text-xs">Critical Analysis Engine</span>
        <h2 className="text-6xl font-black tracking-tighter mt-4 mb-6 text-white">Conflict Detection</h2>
        <p className="text-white/75 text-xl max-w-2xl font-light leading-relaxed">
          Automated identification of potential trajectory violations with AI-powered resolution support.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start relative z-10">
        <div className="rounded-[2rem] p-6 md:p-8 border border-red-500/20 bg-slate-950/90 overflow-hidden relative min-h-[34rem] shadow-[0_24px_80px_rgba(0,0,0,0.42)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(239,68,68,0.18),transparent_55%)] pointer-events-none" />
          <div className="relative z-10 h-full flex flex-col">
            <div className="flex items-center justify-between gap-4 mb-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-red-400">Conflict Mapping</p>
                <h3 className="text-2xl font-bold mt-2 text-white">Live separation hotspots</h3>
              </div>
              <div className="flex items-center gap-2 text-white/50 text-xs uppercase tracking-[0.2em]">
                <Radar size={16} />
                <span>{conflictMap.items.length} shown</span>
              </div>
            </div>

            <div className="relative flex-1 min-h-[24rem] rounded-[1.5rem] border border-white/12 bg-slate-950/96 overflow-hidden shadow-inner">
              {conflictMap.items.length > 0 ? (
                <>
                  <div className="absolute inset-x-0 top-0 flex justify-between px-4 pt-3 text-[10px] uppercase tracking-[0.2em] text-white/30">
                    <span>Lat {conflictMap.latRange.max.toFixed(2)}</span>
                    <span>Lng {conflictMap.lngRange.max.toFixed(2)}</span>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 flex justify-between px-4 pb-3 text-[10px] uppercase tracking-[0.2em] text-white/30">
                    <span>Lat {conflictMap.latRange.min.toFixed(2)}</span>
                    <span>Lng {conflictMap.lngRange.min.toFixed(2)}</span>
                  </div>

                  <svg viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`} className="absolute inset-0 h-full w-full">
                    {[20, 40, 60, 80].map((offset) => (
                      <g key={`grid-${offset}`}>
                        <line x1={offset} y1={0} x2={offset} y2={VIEWBOX_SIZE} stroke="rgba(255,255,255,0.08)" strokeWidth="0.35" />
                        <line x1={0} y1={offset} x2={VIEWBOX_SIZE} y2={offset} stroke="rgba(255,255,255,0.08)" strokeWidth="0.35" />
                      </g>
                    ))}

                    {conflictMap.items.map(({ conflict, firstFlight, secondFlight }) => {
                      const firstPoint = projectPoint(firstFlight.origin.lat, firstFlight.origin.lng);
                      const secondPoint = projectPoint(secondFlight.origin.lat, secondFlight.origin.lng);
                      const conflictPoint = projectPoint(conflict.location.lat, conflict.location.lng);
                      const color = riskColorMap[conflict.riskLevel];
                      const isActive = activeConflictId === conflict.id;

                      return (
                        <g
                          key={conflict.id}
                          onMouseEnter={() => setHoveredConflictId(conflict.id)}
                          onMouseLeave={() => setHoveredConflictId((current) => current === conflict.id ? null : current)}
                          onClick={() => setActiveConflictId(conflict.id)}
                          className="cursor-pointer"
                        >
                          <line
                            x1={firstPoint.x}
                            y1={firstPoint.y}
                            x2={secondPoint.x}
                            y2={secondPoint.y}
                            stroke={color}
                            strokeOpacity={isActive ? "0.9" : "0.55"}
                            strokeWidth={isActive ? "1.15" : "0.85"}
                            strokeDasharray={conflict.riskLevel === 'high' ? '0' : '2 1.6'}
                          />
                          <line
                            x1={firstPoint.x}
                            y1={firstPoint.y}
                            x2={conflictPoint.x}
                            y2={conflictPoint.y}
                            stroke={color}
                            strokeOpacity="0.25"
                            strokeWidth="0.5"
                          />
                          <line
                            x1={secondPoint.x}
                            y1={secondPoint.y}
                            x2={conflictPoint.x}
                            y2={conflictPoint.y}
                            stroke={color}
                            strokeOpacity="0.25"
                            strokeWidth="0.5"
                          />

                          <circle cx={firstPoint.x} cy={firstPoint.y} r={isActive ? "1.75" : "1.4"} fill="#f8fafc" fillOpacity="0.95" />
                          <circle cx={secondPoint.x} cy={secondPoint.y} r={isActive ? "1.75" : "1.4"} fill="#f8fafc" fillOpacity="0.95" />
                          <circle cx={conflictPoint.x} cy={conflictPoint.y} r={isActive ? "3.1" : "2.5"} fill={color} fillOpacity={isActive ? "0.34" : "0.22"} />
                          <circle cx={conflictPoint.x} cy={conflictPoint.y} r={isActive ? "1.8" : "1.35"} fill={color} />
                        </g>
                      );
                    })}
                  </svg>

                  {hoveredConflict && hoveredConflictPosition && (
                    <div
                      className="absolute z-20 -translate-x-1/2 -translate-y-[115%] rounded-2xl border border-white/10 bg-black/85 backdrop-blur-xl px-4 py-3 shadow-2xl min-w-[15rem]"
                      style={{
                        left: `${(hoveredConflictPosition.x / VIEWBOX_SIZE) * 100}%`,
                        top: `${(hoveredConflictPosition.y / VIEWBOX_SIZE) * 100}%`,
                      }}
                    >
                      <p className="text-[10px] uppercase tracking-[0.25em] text-red-400 mb-2">Conflict Pair</p>
                      <p className="text-sm font-semibold text-white">
                        {getFlightLabel(hoveredConflict.conflict.id1)} vs {getFlightLabel(hoveredConflict.conflict.id2)}
                      </p>
                      <div className="flex items-center justify-between mt-2 text-[11px] text-white/65 gap-4">
                        <span>{formatDistanceKm(hoveredConflict.conflict.dist)} separation</span>
                        <span className="uppercase tracking-[0.2em]">{hoveredConflict.conflict.riskLevel}</span>
                      </div>
                      <p className="text-[11px] text-white/45 mt-2 leading-5">
                        {describeConflictLocation(hoveredConflict.conflict)}
                      </p>
                    </div>
                  )}

                  <div className="absolute left-4 top-4 flex flex-col gap-2">
                    <LegendPill label="Aircraft" color="bg-slate-100" />
                    <LegendPill label="High risk" color="bg-red-500" />
                    <LegendPill label="Medium risk" color="bg-amber-500" />
                    <LegendPill label="Low risk" color="bg-blue-500" />
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center space-y-3">
                    <div className="mx-auto w-16 h-16 rounded-full border border-green-500/30 bg-green-500/10 flex items-center justify-center">
                      <Zap size={28} className="text-green-400" />
                    </div>
                    <p className="text-sm font-semibold text-green-400 uppercase tracking-[0.3em]">System Secure</p>
                    <p className="text-sm text-white/40">No active conflicts available for mapping.</p>
                  </div>
                </div>
              )}
            </div>

            {conflictMap.items.length > 0 && (
              <div className="grid grid-cols-3 gap-3 mt-5">
                <MiniStat label="Mapped pairs" value={String(conflictMap.items.length)} />
                <MiniStat
                  label="Highest risk"
                  value={conflicts.some((conflict) => conflict.riskLevel === 'high') ? 'High' : 'Low'}
                />
                <MiniStat
                  label="Closest pass"
                  value={`${Math.min(...conflicts.slice(0, TOP_CONFLICTS).map((conflict) => conflict.dist)).toFixed(2)} km`}
                />
              </div>
            )}
          </div>
        </div>

        <div className="space-y-8 rounded-[2.25rem] border border-white/10 bg-slate-950/96 p-6 md:p-8 shadow-[0_28px_90px_rgba(0,0,0,0.48)]">
          <h3 className="text-3xl font-bold tracking-tight text-white">
            {conflicts.length > 0 ? 'Active Resolution Options' : 'System Secure'}
          </h3>

          <div className="space-y-4">
            {conflicts.length > 0 ? (
              conflicts.slice(0, 6).map((conflict, index) => (
                <ConflictCard
                  key={conflict.id}
                  title={`${getFlightLabel(conflict.id1)} vs ${getFlightLabel(conflict.id2)}`}
                  distance={formatDistanceKm(conflict.dist)}
                  location={`${describeConflictLocation(conflict)} • ${conflict.location.sector}`}
                  risk={conflict.riskLevel}
                  recommended={index === 0}
                  active={activeConflictId === conflict.id}
                  onClick={() => setActiveConflictId(conflict.id)}
                />
              ))
            ) : (
              <div className="p-8 rounded-[2rem] border border-green-500/30 bg-slate-950/90 text-center">
                <p className="text-green-500 font-bold uppercase tracking-widest text-sm">No Conflicts Detected</p>
                <p className="text-white/40 text-xs mt-2">All flight trajectories are within safety margins.</p>
              </div>
            )}
          </div>

          {highlightedConflict && (
            <div className="p-6 rounded-[2rem] bg-slate-900/96 border border-white/12 border-l-4 border-l-red-500 shadow-[0_22px_70px_rgba(0,0,0,0.46)]">
              <p className="text-sm text-white/80 leading-relaxed">
                <strong>System Warning:</strong> Conflict detected between <strong>{getFlightLabel(highlightedConflict.id1)}</strong> and <strong>{getFlightLabel(highlightedConflict.id2)}</strong>.
                Current estimated separation is <strong>{formatDistanceKm(highlightedConflict.dist)}</strong>.
              </p>
            </div>
          )}

          {activeConflict && (
            <div className="p-6 rounded-[2rem] bg-slate-900/96 border border-white/12 space-y-5 shadow-[0_24px_80px_rgba(0,0,0,0.48)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-blue-400">Focused Conflict</p>
                  <h4 className="text-2xl font-bold mt-2 text-white">
                    {getFlightLabel(activeConflict.conflict.id1)} vs {getFlightLabel(activeConflict.conflict.id2)}
                  </h4>
                </div>
                <span className={cn(
                  "px-3 py-1 rounded-full text-[10px] uppercase tracking-[0.2em] font-bold",
                  activeConflict.conflict.riskLevel === 'high'
                    ? "bg-red-500/20 text-red-400"
                    : activeConflict.conflict.riskLevel === 'medium'
                      ? "bg-amber-500/20 text-amber-400"
                      : "bg-blue-500/20 text-blue-400",
                )}>
                  {activeConflict.conflict.riskLevel} risk
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <MiniStat label="Separation" value={formatDistanceKm(activeConflict.conflict.dist)} />
                <MiniStat label="Conflict node" value={activeConflict.conflict.location.place} />
              </div>

              <div className="rounded-2xl border border-white/12 bg-slate-950/90 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">Zone context</p>
                <p className="text-sm text-white mt-2">{activeConflict.conflict.location.zone}</p>
                <p className="text-xs text-white/45 mt-2">
                  {activeConflict.conflict.location.sector} - Lat {activeConflict.conflict.location.lat.toFixed(2)}, Lng {activeConflict.conflict.location.lng.toFixed(2)}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => onConflictFocus?.(activeConflict.conflict, activeConflict.conflict.id1)}
                  className="w-full rounded-2xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 transition-colors px-4 py-4 text-left"
                >
                  <p className="text-[10px] uppercase tracking-[0.2em] text-blue-300">Focus Flight</p>
                  <p className="text-base font-semibold text-white mt-1">{getFlightLabel(activeConflict.conflict.id1)}</p>
                  <p className="text-xs text-white/40 mt-1">Open telemetry and pin this aircraft on the globe.</p>
                </button>
                <button
                  type="button"
                  onClick={() => onConflictFocus?.(activeConflict.conflict, activeConflict.conflict.id2)}
                  className="w-full rounded-2xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 transition-colors px-4 py-4 text-left"
                >
                  <p className="text-[10px] uppercase tracking-[0.2em] text-blue-300">Focus Flight</p>
                  <p className="text-base font-semibold text-white mt-1">{getFlightLabel(activeConflict.conflict.id2)}</p>
                  <p className="text-xs text-white/40 mt-1">Open telemetry and pin this aircraft on the globe.</p>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

const LegendPill = ({ label, color }: { label: string; color: string }) => (
  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/45 border border-white/10 backdrop-blur-md">
    <span className={cn("w-2.5 h-2.5 rounded-full", color)} />
    <span className="text-[10px] uppercase tracking-[0.2em] text-white/65">{label}</span>
  </div>
);

const MiniStat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-2xl border border-white/12 bg-slate-950/88 px-4 py-3">
    <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">{label}</p>
    <p className="text-lg font-bold text-white mt-1">{value}</p>
  </div>
);

const ConflictCard = ({ title, distance, location, risk, recommended, active, onClick }: any) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "w-full flex items-center justify-between group cursor-pointer transition-all text-left rounded-[1.75rem] px-6 py-5 border bg-slate-900/96 shadow-[0_18px_50px_rgba(0,0,0,0.34)] hover:bg-slate-900",
      recommended ? "border-blue-500/40" : "border-white/10",
      active && "border-red-500/40 bg-slate-900/96",
    )}
  >
    <div className="flex items-center gap-4 min-w-0">
      <div className={cn(
        "p-2 rounded-lg shrink-0",
        active
          ? "bg-red-500/20 text-red-400"
          : recommended
            ? "bg-blue-500/20 text-blue-400"
            : "bg-white/10 text-white/60",
      )}>
        {recommended ? <Zap size={20} /> : <ShieldAlert size={20} />}
      </div>
      <div className="min-w-0">
        <p className="font-semibold text-white truncate">{title}</p>
        <div className="flex flex-wrap gap-4 mt-1">
          <span className="text-[10px] text-white/60 flex items-center gap-1">
            <ShieldAlert size={10} /> Risk: {risk}
          </span>
          <span className="text-[10px] text-white/60 flex items-center gap-1">
            <MapPin size={10} /> {location}
          </span>
        </div>
      </div>
    </div>
    <div className="text-right shrink-0 ml-4">
      <span className="text-sm font-medium text-white/90 block">{distance}</span>
      <span className="text-[10px] text-white/35 uppercase tracking-[0.2em] flex items-center justify-end gap-1 mt-1">
        <Plane size={10} /> pair
      </span>
    </div>
  </button>
);
