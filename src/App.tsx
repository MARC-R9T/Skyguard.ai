/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDashboardState, getPrediction } from "./services/flightEngine";
import React, { lazy, startTransition, useState, useEffect, Suspense, useRef, useMemo, useDeferredValue } from 'react';
import { motion, useScroll, useTransform, AnimatePresence, useMotionValueEvent } from 'motion/react';
import { FlightDetails } from './components/FlightDetails';
import { StatsSection } from './components/StatsSection';
import { ConflictSection } from './components/ConflictSection';
import { DelayPropagationSection } from './components/DelayPropagationSection';
import { Conflict, Coordinate, DashboardAnalysis, Flight, MapLayer } from './types';
import { Plane, Search, Bell, Activity, AlertTriangle, X, Layers, Cloud, Wind, BarChart3, ChevronRight, Sparkles } from 'lucide-react';
import { cn } from './lib/utils';

const DASHBOARD_POLL_INTERVAL_MS = 8000;
const DASHBOARD_HIDDEN_POLL_INTERVAL_MS = 20000;
const DASHBOARD_MAX_BACKOFF_MS = 60000;
const MAX_GLOBE_FLIGHTS = 180;
const MAX_GLOBE_CONFLICTS = 36;
const GlobeCanvas = lazy(() => import('./components/GlobeCanvas').then((module) => ({ default: module.GlobeCanvas })));

const sampleEvenly = <T,>(items: T[], limit: number) => {
  if (limit <= 0) {
    return [];
  }

  if (items.length <= limit) {
    return items;
  }

  const step = items.length / limit;
  return Array.from({ length: limit }, (_, index) => items[Math.floor(index * step)]);
};

const quantile = (values: number[], ratio: number) => {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((first, second) => first - second);
  const clampedRatio = Math.min(Math.max(ratio, 0), 1);
  const position = Math.floor((sorted.length - 1) * clampedRatio);
  return sorted[position] ?? sorted[sorted.length - 1] ?? 0;
};

const formatDistanceKm = (distanceKm: number) =>
  distanceKm < 0.1 ? `${distanceKm.toFixed(3)} km` : `${distanceKm.toFixed(2)} km`;

const selectRenderableFlights = (
  flights: Flight[],
  selectedFlightId?: string | null,
  hoveredFlightId?: string | null,
) => {
  if (flights.length <= MAX_GLOBE_FLIGHTS) {
    return flights;
  }

  const pinnedIds = new Set(
    [selectedFlightId, hoveredFlightId].filter(Boolean) as string[],
  );
  const zoneCounts = new Map<string, number>();
  const countryCounts = new Map<string, number>();

  flights.forEach((flight) => {
    const zoneKey = flight.zone ?? flight.origin.zone ?? 'Unknown';
    const countryKey = flight.originCountry ?? 'Unknown';
    zoneCounts.set(zoneKey, (zoneCounts.get(zoneKey) ?? 0) + 1);
    countryCounts.set(countryKey, (countryCounts.get(countryKey) ?? 0) + 1);
  });

  const densityScoreById = new Map<string, number>();
  const densityScores = flights.map((flight) => {
    const zoneKey = flight.zone ?? flight.origin.zone ?? 'Unknown';
    const countryKey = flight.originCountry ?? 'Unknown';
    const densityScore = ((zoneCounts.get(zoneKey) ?? 0) * 1.35) + (countryCounts.get(countryKey) ?? 0);
    densityScoreById.set(flight.id, densityScore);
    return densityScore;
  });

  const moderateDensityThreshold = quantile(densityScores, 0.42);
  const goodDensityThreshold = quantile(densityScores, 0.72);
  const lowDensityThreshold = quantile(densityScores, 0.16);
  const picked = new Set<string>();
  const selected: Flight[] = [];
  const sortByDensity = (items: Flight[], direction: 'asc' | 'desc' = 'desc') => (
    [...items].sort((first, second) => {
      const difference = (densityScoreById.get(second.id) ?? 0) - (densityScoreById.get(first.id) ?? 0);
      return direction === 'desc' ? difference : -difference;
    })
  );

  const take = (items: Flight[], limit: number) => {
    if (selected.length >= MAX_GLOBE_FLIGHTS) {
      return;
    }

    const nextItems = sampleEvenly(
      items.filter((flight) => !picked.has(flight.id)),
      Math.min(limit, MAX_GLOBE_FLIGHTS - selected.length),
    );

    nextItems.forEach((flight) => {
      if (!picked.has(flight.id) && selected.length < MAX_GLOBE_FLIGHTS) {
        selected.push(flight);
        picked.add(flight.id);
      }
    });
  };

  take(flights.filter((flight) => pinnedIds.has(flight.id)), MAX_GLOBE_FLIGHTS);
  take(flights.filter((flight) => flight.status === 'conflict'), 58);
  take(flights.filter((flight) => flight.futureConflict), 48);
  take(
    sortByDensity(flights.filter((flight) => (densityScoreById.get(flight.id) ?? 0) >= moderateDensityThreshold)),
    44,
  );
  take(
    sortByDensity(flights.filter((flight) => (densityScoreById.get(flight.id) ?? 0) >= goodDensityThreshold)),
    30,
  );
  take(
    sortByDensity(
      flights.filter((flight) => (densityScoreById.get(flight.id) ?? 0) <= lowDensityThreshold),
      'asc',
    ),
    18,
  );
  take(flights.filter((flight) => (flight.prediction?.length ?? 0) > 0), 30);
  take(flights.filter((flight) => (flight.delayMinutes ?? 0) > 0), 22);
  take(flights.filter((flight) => (flight.history?.length ?? 0) >= 2), 42);
  take(flights, MAX_GLOBE_FLIGHTS);

  return selected;
};

const LayerButton = ({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) => (
  <button
    onClick={onClick}
    className={cn(
      "flex items-center gap-3 px-3 py-2 rounded-xl transition-all border backdrop-blur-xl",
      active
        ? "bg-blue-500/20 border-blue-500/50 text-blue-400 shadow-[0_0_20px_rgba(0,122,255,0.2)]"
        : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10",
    )}
  >
    {icon}
    <span className="text-[9px] font-bold uppercase tracking-widest">{label}</span>
  </button>
);

const Legend = () => (
  <motion.div
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    className="fixed left-12 bottom-12 z-[100] glass p-6 space-y-4 w-72"
  >
    <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">Map Legend</h4>
    <div className="space-y-3">
      <LegendRow colorClass="bg-blue-500 shadow-[0_0_10px_rgba(0,122,255,0.5)]" label="Normal traffic arc" />
      <LegendRow colorClass="bg-red-500 shadow-[0_0_10px_rgba(255,59,48,0.5)]" label="Active conflict" pulse />
      <LegendRow colorClass="bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.5)]" label="Predicted future path" />
      <LegendRow colorClass="bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)]" label="Density towers" />
      <LegendRow colorClass="bg-blue-300/70 border border-blue-300/70" label="Weather flow zone" />
      <LegendRow colorClass="bg-orange-400/70 border border-orange-300/70" label="Turbulence zone" />
    </div>
  </motion.div>
);

const LegendRow = ({ colorClass, label, pulse = false }: { colorClass: string; label: string; pulse?: boolean }) => (
  <div className="flex items-center gap-3">
    <div className={cn("w-3 h-3 rounded-full", colorClass, pulse && "animate-pulse")} />
    <span className="text-[10px] font-medium text-white/70 uppercase tracking-wider">{label}</span>
  </div>
);

export default function App() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [futureConflicts, setFutureConflicts] = useState<Conflict[]>([]);
  const [analysis, setAnalysis] = useState<DashboardAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isInteractable, setIsInteractable] = useState(false);
  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);
  const [selectedAirport, setSelectedAirport] = useState<any>(null);
  const [hoveredFlight, setHoveredFlight] = useState<Flight | null>(null);
  const [activeLayer, setActiveLayer] = useState<MapLayer>('traffic');
  const [isLayersOpen, setIsLayersOpen] = useState(false);
  const [result, setResult] = useState<{ result?: Coordinate[]; error?: string } | null>(null);
  const [predictionLoading, setPredictionLoading] = useState(false);
  const [isPredictionPanelOpen, setIsPredictionPanelOpen] = useState(false);
  const [showRawPrediction, setShowRawPrediction] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<'live' | 'local' | 'unavailable'>('unavailable');
  const predictionCacheRef = useRef<Record<string, Coordinate[]>>({});
  const pollTimeoutRef = useRef<number | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const isPollingRef = useRef(false);
  const isInteractableRef = useRef(false);
  const retryDelayRef = useRef(DASHBOARD_POLL_INTERVAL_MS);
  const { scrollYProgress } = useScroll();

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    const nextInteractable = latest > 0.04 && latest < 0.24;
    if (isInteractableRef.current !== nextInteractable) {
      isInteractableRef.current = nextInteractable;
      setIsInteractable(nextInteractable);
    }
  });

  useEffect(() => {
    let disposed = false;

    const scheduleNextPoll = (delay: number) => {
      if (disposed) {
        return;
      }

      if (pollTimeoutRef.current !== null) {
        window.clearTimeout(pollTimeoutRef.current);
      }

      pollTimeoutRef.current = window.setTimeout(() => {
        void loadDashboard();
      }, delay);
    };

    const loadDashboard = async () => {
      if (disposed || isPollingRef.current) {
        return;
      }

      isPollingRef.current = true;
      fetchAbortRef.current?.abort();
      fetchAbortRef.current = new AbortController();
      let nextDelay = document.visibilityState === 'visible'
        ? DASHBOARD_POLL_INTERVAL_MS
        : DASHBOARD_HIDDEN_POLL_INTERVAL_MS;

      try {
        const data = await getDashboardState(fetchAbortRef.current.signal);
        if (disposed) {
          return;
        }

        if (data.error) {
          retryDelayRef.current = Math.min(retryDelayRef.current * 2, DASHBOARD_MAX_BACKOFF_MS);
          nextDelay = Math.max(
            retryDelayRef.current,
            document.visibilityState === 'visible'
              ? DASHBOARD_POLL_INTERVAL_MS
              : DASHBOARD_HIDDEN_POLL_INTERVAL_MS,
          );
          console.warn("Dashboard polling backoff active:", data.error);
          return;
        }

        retryDelayRef.current = DASHBOARD_POLL_INTERVAL_MS;

        const mergedFlights = (data.states ?? []).map((flight) => {
          const prediction = predictionCacheRef.current[flight.id];
          return prediction ? { ...flight, prediction } : flight;
        });

        startTransition(() => {
          setFlights(mergedFlights);
          setConflicts(data.conflicts ?? []);
          setFutureConflicts(data.future_conflicts ?? []);
          setAnalysis(data.analysis ?? null);
          setLastUpdated(data.timestamp ?? null);
          setDataSource(data.source ?? 'unavailable');
          setIsDemoMode((data.source ?? 'unavailable') !== 'live');
          setSelectedFlight((current) => current ? mergedFlights.find((flight) => flight.id === current.id) ?? null : null);
          setHoveredFlight((current) => current ? mergedFlights.find((flight) => flight.id === current.id) ?? null : null);
        });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.error("Error loading dashboard state:", error);
          retryDelayRef.current = Math.min(retryDelayRef.current * 2, DASHBOARD_MAX_BACKOFF_MS);
          nextDelay = Math.max(
            retryDelayRef.current,
            document.visibilityState === 'visible'
              ? DASHBOARD_POLL_INTERVAL_MS
              : DASHBOARD_HIDDEN_POLL_INTERVAL_MS,
          );
        }
      } finally {
        isPollingRef.current = false;
        if (!disposed) {
          setLoading(false);
          scheduleNextPoll(nextDelay);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      if (pollTimeoutRef.current !== null) {
        window.clearTimeout(pollTimeoutRef.current);
      }

      if (!isPollingRef.current) {
        void loadDashboard();
      }
    };

    void loadDashboard();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      fetchAbortRef.current?.abort();
      if (pollTimeoutRef.current !== null) {
        window.clearTimeout(pollTimeoutRef.current);
      }
    };
  }, []);

  const globeOpacity = useTransform(scrollYProgress, [0, 0.18, 0.24], [1, 1, 0]);
  const headlineOpacity = useTransform(scrollYProgress, [0, 0.08], [1, 0]);
  const headlineY = useTransform(scrollYProgress, [0, 0.08], [0, -100]);
  const contentOpacity = useTransform(scrollYProgress, [0.22, 0.28], [0, 1]);
  const contentY = useTransform(scrollYProgress, [0.22, 0.28], [20, 0]);

  const predictionTarget = useMemo(
    () => selectedFlight ?? flights.find((flight) => (flight.history?.length ?? 0) > 0) ?? null,
    [flights, selectedFlight],
  );

  const handlePredict = async () => {
    if (!predictionTarget || (predictionTarget.history?.length ?? 0) === 0) {
      setResult({ error: "No flight with usable trajectory history is available yet." });
      setIsPredictionPanelOpen(true);
      return;
    }

    setPredictionLoading(true);
    setIsPredictionPanelOpen(true);

    const inputData = {
      trajectory: (predictionTarget.history ?? []).map((point) => [point.lat, point.lng]),
      steps: 5,
    };

    try {
      const response = await getPrediction(inputData);
      if (response?.result?.length) {
        predictionCacheRef.current[predictionTarget.id] = response.result;
        startTransition(() => {
          setFlights((current) => current.map((flight) => (
            flight.id === predictionTarget.id
              ? { ...flight, prediction: response.result }
              : flight
          )));
          setSelectedFlight((current) => (
            current?.id === predictionTarget.id
              ? { ...current, prediction: response.result }
              : current
          ));
        });
      }

      setResult(response ?? { error: "Prediction service is unavailable." });
      setShowRawPrediction(Boolean(response));
    } catch (error) {
      console.error("Prediction trigger failed:", error);
      setResult({ error: "Prediction request failed." });
    } finally {
      setPredictionLoading(false);
    }
  };

  const deferredFlights = useDeferredValue(flights);
  const globeFlights = useMemo(
    () => selectRenderableFlights(deferredFlights, selectedFlight?.id, hoveredFlight?.id),
    [deferredFlights, selectedFlight?.id, hoveredFlight?.id],
  );
  const visibleFlightIds = useMemo(
    () => new Set(globeFlights.map((flight) => flight.id)),
    [globeFlights],
  );
  const globeConflicts = useMemo(
    () => conflicts
      .filter((conflict) => visibleFlightIds.has(conflict.id1) && visibleFlightIds.has(conflict.id2))
      .slice(0, MAX_GLOBE_CONFLICTS),
    [conflicts, visibleFlightIds],
  );
  const globeFutureConflicts = useMemo(
    () => futureConflicts
      .filter((conflict) => visibleFlightIds.has(conflict.id1) && visibleFlightIds.has(conflict.id2))
      .slice(0, MAX_GLOBE_CONFLICTS),
    [futureConflicts, visibleFlightIds],
  );
  const trackedFlightCount = analysis?.total_flights ?? flights.length;
  const renderSubsetActive = trackedFlightCount > globeFlights.length;
  const delaySignalCount = useMemo(
    () => flights.filter((flight) => (flight.delayMinutes ?? 0) > 0).length,
    [flights],
  );
  const totalDelayMinutes = useMemo(
    () => flights.reduce((sum, flight) => sum + (flight.delayMinutes ?? 0), 0),
    [flights],
  );
  const hotspot = analysis?.density_hotspots?.[0];
  const briefing = analysis?.briefing;
  const futureLead = futureConflicts[0];
  const navItems = [
    { label: 'Live Map', sectionId: 'live-map-section' },
    { label: 'Analytics', sectionId: 'analytics-section' },
    { label: 'Conflicts', sectionId: 'conflicts-section' },
    { label: 'Delays', sectionId: 'delay-section' },
    { label: 'Hazards', sectionId: 'hazards-section' },
  ];
  const selectedAirportFlights = useMemo(
    () => selectedAirport
      ? flights.filter((flight) =>
          Math.abs(flight.origin.lat - selectedAirport.lat) < 8 &&
          Math.abs(flight.origin.lng - selectedAirport.lng) < 8,
        )
      : [],
    [flights, selectedAirport],
  );
  const predictionSummary = useMemo(() => {
    if (result?.error) {
      return result.error;
    }

    if (result?.result?.length) {
      const lastPoint = result.result[result.result.length - 1];
      return `${result.result.length} forecast nodes were generated. The path is now visible in yellow on the globe and ends near ${lastPoint.lat.toFixed(2)}, ${lastPoint.lng.toFixed(2)}.`;
    }

    return 'Run a backend prediction to project the selected aircraft path.';
  }, [result]);

  const handleConflictFocus = (conflict: Conflict, preferredFlightId: string) => {
    const primaryFlight = flights.find((flight) => flight.id === preferredFlightId) ?? null;
    const secondaryFlightId = preferredFlightId === conflict.id1 ? conflict.id2 : conflict.id1;
    const secondaryFlight = flights.find((flight) => flight.id === secondaryFlightId) ?? null;

    if (!primaryFlight) {
      return;
    }

    startTransition(() => {
      setSelectedAirport(null);
      setSelectedFlight(primaryFlight);
      setHoveredFlight(secondaryFlight);
      setActiveLayer('traffic');
      setIsLayersOpen(false);
    });

    const targetTop = Math.min(
      window.innerHeight * 1.8,
      Math.max(document.documentElement.scrollHeight - window.innerHeight, 0),
    );
    window.scrollTo({ top: targetTop, behavior: 'smooth' });
  };

  const handleSectionNavigation = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  return (
    <div className="relative min-h-[760vh] bg-black text-white selection:bg-blue-500/30">
      <div className="fixed top-24 left-8 z-[110] pointer-events-auto">
        <AnimatePresence initial={false}>
          {isPredictionPanelOpen ? (
            <motion.div
              key="prediction-drawer"
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              className="w-[24rem] bg-black/72 backdrop-blur-2xl border border-white/10 p-5 rounded-[1.5rem] shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-blue-300">Prediction Console</p>
                  <h3 className="text-lg font-semibold mt-2">Backend trajectory forecast</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPredictionPanelOpen(false)}
                  className="w-9 h-9 rounded-full border border-white/10 bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Target</p>
                <p className="text-sm font-semibold text-white mt-2">
                  {predictionTarget ? predictionTarget.callsign : 'Waiting for flight history'}
                </p>
                <p className="text-xs text-white/50 mt-2 leading-6">
                  {predictionTarget?.locationLabel ?? 'Select a flight or wait for the first synced aircraft with trajectory history.'}
                </p>
                <p className="text-xs text-white/35 mt-2">
                  {(predictionTarget?.history?.length ?? 0)} history points available
                </p>
              </div>

              <button
                onClick={handlePredict}
                className="mt-4 w-full bg-blue-500 hover:bg-blue-600 text-white font-bold uppercase text-[10px] tracking-widest py-3 px-4 rounded-xl transition-colors border border-blue-400 disabled:bg-white/10 disabled:border-white/10 disabled:text-white/40"
                disabled={predictionLoading}
              >
                {predictionLoading ? "Processing..." : "Run Backend Prediction"}
              </button>

              <p className="mt-4 text-sm text-white/60 leading-7">
                The panel can stay collapsed until you need it. When a path is generated, the globe caches it and paints the forecast route in yellow.
              </p>

              <div className="mt-4 rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-4">
                <p className="text-[10px] uppercase tracking-[0.2em] text-yellow-300">Prediction Summary</p>
                <p className="text-sm text-white/80 mt-2 leading-7">{predictionSummary}</p>
              </div>

              {result && (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => setShowRawPrediction((current) => !current)}
                    className="text-xs uppercase tracking-[0.2em] text-white/45 hover:text-white/70 transition-colors"
                  >
                    {showRawPrediction ? 'Hide raw response' : 'Show raw response'}
                  </button>
                  <AnimatePresence initial={false}>
                    {showRawPrediction && (
                      <motion.pre
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-3 text-[10px] text-white/80 bg-white/5 p-3 rounded-xl max-h-56 overflow-auto border border-white/10"
                      >
                        {JSON.stringify(result, null, 2)}
                      </motion.pre>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.button
              key="prediction-toggle"
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              type="button"
              onClick={() => setIsPredictionPanelOpen(true)}
              className="flex items-center gap-3 rounded-full border border-white/10 bg-black/70 px-5 py-3 backdrop-blur-xl hover:bg-white/10 transition-colors shadow-2xl"
            >
              <div className="w-9 h-9 rounded-full bg-blue-500/20 border border-blue-500/20 flex items-center justify-center">
                <Sparkles size={16} className="text-blue-300" />
              </div>
              <div className="text-left">
                <p className="text-[10px] uppercase tracking-[0.25em] text-white/40">Prediction Console</p>
                <p className="text-sm font-medium text-white">Open forecast controls</p>
              </div>
              <ChevronRight size={16} className="text-white/40" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <nav className="fixed top-0 left-0 w-full z-[100] px-8 py-6 flex justify-between items-center backdrop-blur-md bg-black/20 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 apple-gradient-blue rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Plane className="text-white" size={20} />
          </div>
          <span className="text-xl font-bold tracking-tighter">SkyGuard AI</span>
        </div>

        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-white/60">
          {navItems.map((item) => (
            <button
              key={item.sectionId}
              type="button"
              onClick={() => handleSectionNavigation(item.sectionId)}
              className="hover:text-white transition-colors"
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <button className="p-2 hover:bg-white/5 rounded-full transition-colors"><Search size={20} /></button>
          <button className="p-2 hover:bg-white/5 rounded-full transition-colors relative">
            <Bell size={20} />
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full" />
          </button>
          <div className="h-8 w-[1px] bg-white/10 mx-2" />
          <button className="flex items-center gap-2 pl-2 pr-4 py-1.5 bg-white/5 hover:bg-white/10 rounded-full transition-colors border border-white/10">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-gray-400 to-gray-600" />
            <span className="text-xs font-medium">Admin</span>
          </button>
        </div>
      </nav>

      <motion.div
        style={{ opacity: globeOpacity }}
        className={cn(
          "fixed inset-0 transition-all duration-500",
          isInteractable ? "z-40 pointer-events-auto" : "z-0 pointer-events-none",
        )}
      >
        <Suspense fallback={null}>
          <GlobeCanvas
            flights={globeFlights}
            conflicts={globeConflicts}
            futureConflicts={globeFutureConflicts}
            analysis={analysis}
            onFlightClick={setSelectedFlight}
            onAirportClick={setSelectedAirport}
            onFlightHover={setHoveredFlight}
            hoveredFlight={hoveredFlight}
            scrollYProgress={scrollYProgress}
            isInteractable={isInteractable}
            selectedTarget={selectedFlight || selectedAirport}
            selectedFlightId={selectedFlight?.id ?? null}
            activeLayer={activeLayer}
          />
        </Suspense>

        <AnimatePresence>
          {isInteractable && !selectedFlight && !selectedAirport && (
            <>
              <Legend />
              <div className="fixed right-12 bottom-12 z-[100] flex flex-row-reverse items-center gap-3">
                <button
                  onClick={() => setIsLayersOpen(!isLayersOpen)}
                  className={cn(
                    "w-12 h-12 rounded-full backdrop-blur-xl flex items-center justify-center transition-all border shadow-lg shrink-0",
                    isLayersOpen
                      ? "bg-blue-500 text-white border-blue-400"
                      : "bg-white/10 text-white/70 border-white/20 hover:bg-white/20",
                  )}
                >
                  <Layers size={20} />
                </button>
                <AnimatePresence>
                  {isLayersOpen && (
                    <motion.div
                      initial={{ opacity: 0, x: 20, scale: 0.95 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: 20, scale: 0.95 }}
                      className="flex flex-row gap-2"
                    >
                      <LayerButton
                        active={activeLayer === 'traffic'}
                        onClick={() => { setActiveLayer('traffic'); setIsLayersOpen(false); }}
                        icon={<Activity size={16} />}
                        label="Traffic"
                      />
                      <LayerButton
                        active={activeLayer === 'weather'}
                        onClick={() => { setActiveLayer('weather'); setIsLayersOpen(false); }}
                        icon={<Cloud size={16} />}
                        label="Weather"
                      />
                      <LayerButton
                        active={activeLayer === 'turbulence'}
                        onClick={() => { setActiveLayer('turbulence'); setIsLayersOpen(false); }}
                        icon={<Wind size={16} />}
                        label="Turbulence"
                      />
                      <LayerButton
                        active={activeLayer === 'density'}
                        onClick={() => { setActiveLayer('density'); setIsLayersOpen(false); }}
                        icon={<BarChart3 size={16} />}
                        label="Density"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {(selectedFlight || selectedAirport) && (
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              onClick={() => {
                setSelectedFlight(null);
                setSelectedAirport(null);
              }}
              className="absolute bottom-12 left-1/2 -translate-x-1/2 z-50 px-8 py-3 bg-white/10 backdrop-blur-xl border border-white/20 rounded-full font-bold uppercase tracking-widest text-xs hover:bg-white/20 transition-all flex items-center gap-3"
            >
              <X size={16} />
              Reset View
            </motion.button>
          )}
        </AnimatePresence>

        {selectedAirport && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-80 glass p-8 text-center"
          >
            <h3 className="text-2xl font-bold mb-2">{selectedAirport.name}</h3>
            <p className="text-blue-400 font-mono mb-6">{selectedAirport.code}</p>
            <div className="grid grid-cols-2 gap-4 text-left">
              <div className="glass p-3">
                <p className="text-[10px] text-white/40 uppercase">Tracked Nearby</p>
                <p className="text-xl font-bold">{selectedAirportFlights.length}</p>
              </div>
              <div className="glass p-3">
                <p className="text-[10px] text-white/40 uppercase">Conflict Alerts</p>
                <p className="text-xl font-bold">
                  {selectedAirportFlights.filter((flight) => flight.status === 'conflict').length}
                </p>
              </div>
            </div>
            <button
              onClick={() => setSelectedAirport(null)}
              className="mt-8 w-full py-3 apple-gradient-blue rounded-xl font-bold text-xs uppercase tracking-widest"
            >
              Close Analysis
            </button>
          </motion.div>
        )}

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
              <p className="text-blue-500 font-medium tracking-widest uppercase text-xs">Syncing Backend Traffic...</p>
            </div>
          </div>
        )}
      </motion.div>

      <section id="live-map-section" className="relative h-screen w-full overflow-hidden pointer-events-none scroll-mt-28">
        <motion.div
          style={{
            opacity: useTransform(scrollYProgress, [0.02, 0.08, 0.22], [0, 1, 0]),
            x: useTransform(scrollYProgress, [0.02, 0.08, 0.22], [-100, 0, -100]),
          }}
          className="fixed top-1/2 -translate-y-1/2 left-12 z-50 w-[380px] space-y-6 pointer-events-auto"
        >
          <div className="bg-blue-950/20 backdrop-blur-3xl border border-blue-500/30 rounded-[2rem] p-8 shadow-[0_0_40px_rgba(0,122,255,0.15)]">
            <div className="flex items-center gap-4 mb-6 text-blue-400">
              <Activity size={24} />
              <span className="text-sm font-bold uppercase tracking-widest">System Metrics</span>
            </div>
            <div className="space-y-6">
              <div>
                <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Active Conflicts</p>
                <div className="flex items-end gap-3">
                  <p className="text-5xl font-bold text-red-500">{conflicts.length}</p>
                  <span className="text-xs text-red-500/60 mb-1 font-medium">Critical</span>
                </div>
              </div>
              <div>
                <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Future Path Alerts</p>
                <div className="flex items-end gap-3">
                  <p className="text-5xl font-bold text-yellow-400">{futureConflicts.length}</p>
                  <span className="text-xs text-yellow-400/60 mb-1 font-medium">Forecasted</span>
                </div>
              </div>
              <div>
                <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Delay Signals</p>
                <div className="flex items-end gap-3">
                  <p className="text-5xl font-bold text-orange-400">{delaySignalCount}</p>
                  <span className="text-xs text-orange-400/60 mb-1 font-medium">{totalDelayMinutes} min total</span>
                </div>
              </div>
              <div>
                <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Forecast Focus</p>
                <div className="space-y-2">
                  <p className="text-2xl font-bold text-yellow-300">
                    {futureLead ? futureLead.location.place : 'Clear Horizon'}
                  </p>
                  <p className="text-xs text-yellow-200/60 font-medium">
                    {futureLead
                      ? `${formatDistanceKm(futureLead.dist)} at step ${futureLead.step ?? 1}`
                      : 'No future-path conflicts projected'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          style={{
            opacity: useTransform(scrollYProgress, [0.02, 0.08, 0.22], [0, 1, 0]),
            x: useTransform(scrollYProgress, [0.02, 0.08, 0.22], [100, 0, 100]),
          }}
          className="fixed top-1/2 -translate-y-1/2 right-12 z-50 w-[380px] space-y-6 pointer-events-auto"
        >
          <div className="bg-red-950/20 backdrop-blur-3xl border border-red-500/30 rounded-[2rem] p-8 shadow-[0_0_40px_rgba(255,59,48,0.15)]">
            <div className="flex items-center gap-4 mb-6 text-red-400">
              <AlertTriangle size={24} />
              <span className="text-sm font-bold uppercase tracking-widest">Hazard Alerts</span>
            </div>
            <div className="space-y-5">
              <HeroAlert
                tone="red"
                title="Source"
                badge={dataSource === 'live' ? 'LIVE' : 'FALLBACK'}
                body={dataSource === 'live'
                  ? 'The frontend is consuming the live backend snapshot.'
                  : 'The backend is serving its local dataset fallback from the backend/data folder.'}
              />
              <HeroAlert
                tone="yellow"
                title="Hotspot"
                badge={hotspot ? 'MED' : 'LOW'}
                body={hotspot
                  ? `${hotspot.place} is the busiest density cell with ${hotspot.count} flights across ${hotspot.zone}.`
                  : 'No density hotspot is available from the current backend response.'}
              />
              <HeroAlert
                tone="blue"
                title="Forecast"
                badge={futureConflicts.length > 0 ? 'WATCH' : 'CLEAR'}
                body={futureConflicts[0]
                  ? `${futureConflicts[0].location.place} is the lead future-path watch zone with ${futureConflicts.length} projected conflict pairs in the forecast horizon.`
                  : 'No future-path conflicts are currently projected.'}
              />
            </div>
          </div>
        </motion.div>

        <motion.div
          style={{
            opacity: useTransform(scrollYProgress, [0.08, 0.14, 0.22], [0, 1, 0]),
            y: useTransform(scrollYProgress, [0.08, 0.14, 0.22], [20, 0, -20]),
          }}
          className="absolute bottom-24 left-8 z-50"
        >
          <div className="glass p-6 border-blue-500/30 w-[24rem] pointer-events-auto shadow-2xl shadow-blue-500/10">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2 text-blue-400">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-widest">
                  {isDemoMode ? 'Backend Dataset Fallback' : 'Live Backend Traffic'}
                </span>
              </div>
              <div className="px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20">
                <span className="text-[8px] font-bold text-blue-400 uppercase tracking-tighter">
                  {dataSource === 'live' ? 'Real-time' : 'Dataset'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                <p className="text-[9px] text-white/40 uppercase tracking-wider mb-1">Active Flights</p>
                <p className="text-2xl font-bold tabular-nums text-white">{trackedFlightCount}</p>
                {renderSubsetActive && (
                  <p className="text-[9px] text-white/35 mt-1">Rendering {globeFlights.length} prioritized tracks</p>
                )}
              </div>
              <div className={cn(
                "p-3 rounded-xl border transition-colors duration-500",
                conflicts.length > 0
                  ? "bg-red-500/10 border-red-500/30"
                  : "bg-white/5 border-white/5",
              )}>
                <p className="text-[9px] text-white/40 uppercase tracking-wider mb-1">Conflict Layers</p>
                <p className={cn(
                  "text-2xl font-bold tabular-nums",
                  conflicts.length > 0 ? "text-red-500" : "text-white/60",
                )}>
                  {conflicts.length}/{futureConflicts.length}
                </p>
                <p className="text-[9px] text-white/35 mt-1">Current / forecasted pairs</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-white/40 uppercase tracking-wider">Explainable AI summary</span>
                <span className="text-green-500 font-bold tracking-widest">ACTIVE</span>
              </div>
              <p className="text-xs text-white/55 leading-6">
                {briefing?.summary ?? 'Awaiting backend telemetry to generate a narrative briefing.'}
              </p>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <p className="text-[9px] text-white/40 leading-relaxed font-medium">
                  System Status:
                  <span className="text-white/80">
                    {lastUpdated ? ` Updated ${new Date(lastUpdated).toLocaleTimeString()}` : ' Awaiting backend telemetry'}
                  </span>
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
          <motion.div
            style={{ opacity: headlineOpacity, y: headlineY }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 1 }}
            className="max-w-4xl"
          >
            <h1 className="text-7xl md:text-8xl font-bold tracking-tighter mb-6 gradient-text">
              Predicting the <br />Future of Flight
            </h1>
            <p className="text-xl md:text-2xl text-white/40 font-light max-w-3xl mx-auto leading-relaxed">
              Global aviation intelligence with explainable congestion summaries, real-time hazard layers, and future-path conflict forecasting.
            </p>
          </motion.div>
        </div>

        <motion.div
          style={{ opacity: headlineOpacity }}
          className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/20"
        >
          <span className="text-[10px] uppercase tracking-[0.2em] font-bold">Scroll to Explore</span>
          <div className="w-[1px] h-12 bg-gradient-to-b from-white/20 to-transparent" />
        </motion.div>
      </section>

      <section className="h-[180vh] w-full pointer-events-none" />

      <motion.main
        style={{ opacity: contentOpacity, y: contentY }}
        className="relative z-[60] bg-black w-full"
      >
        <div className="bg-black">
          <div id="analytics-section" className="scroll-mt-28">
            <StatsSection analysis={analysis} flights={flights} futureConflicts={futureConflicts} />
          </div>
          <div className="h-24" />
          <div id="conflicts-section" className="scroll-mt-28">
            <ConflictSection
              flights={flights}
              conflicts={conflicts}
              onConflictFocus={handleConflictFocus}
            />
          </div>
          <div className="h-24" />
          <DelayPropagationSection />
        </div>

        <footer className="py-24 px-8 border-t border-white/5 bg-black relative z-[70]">
          <motion.div
            initial={{ opacity: 1 }}
            whileInView={{ opacity: 1 }}
            className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12"
          >
            <div className="col-span-2">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 apple-gradient-blue rounded-lg flex items-center justify-center">
                  <Plane className="text-white" size={16} />
                </div>
                <span className="text-lg font-bold tracking-tighter">SkyGuard AI</span>
              </div>
              <p className="text-white/70 text-sm max-w-md leading-relaxed">
                Advanced aviation intelligence platform developed for next-generation air traffic management.
                Leveraging spatio-temporal machine learning and network science.
              </p>
            </div>
            <div>
              <h4 className="font-bold mb-6 text-sm uppercase tracking-widest text-white/80">Platform</h4>
              <ul className="space-y-4 text-sm text-white/60">
                <li><a href="#" className="hover:text-white transition-colors">Live Traffic</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Delay Modeling</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Conflict Engine</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Hazard Detection</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-6 text-sm uppercase tracking-widest text-white/80">Resources</h4>
              <ul className="space-y-4 text-sm text-white/60">
                <li><a href="#" className="hover:text-white transition-colors">Documentation</a></li>
                <li><a href="#" className="hover:text-white transition-colors">API Reference</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Research Papers</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Support</a></li>
              </ul>
            </div>
          </motion.div>
          <div className="max-w-7xl mx-auto mt-24 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] uppercase tracking-widest text-white/40 font-bold">
            <span>© 2026 SkyGuard AI Systems. All rights reserved.</span>
            <div className="flex gap-8">
              <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
            </div>
          </div>
        </footer>
        <div className="h-[200vh] bg-black" aria-hidden="true" />
      </motion.main>

      <AnimatePresence>
        {selectedFlight && (
          <FlightDetails
            flight={selectedFlight}
            onClose={() => setSelectedFlight(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

const HeroAlert = ({
  tone,
  title,
  badge,
  body,
}: {
  tone: 'red' | 'yellow' | 'blue';
  title: string;
  badge: string;
  body: string;
}) => {
  const toneClass = tone === 'red'
    ? 'bg-red-500/10 border-red-500/20'
    : tone === 'yellow'
      ? 'bg-yellow-500/10 border-yellow-500/20'
      : 'bg-blue-500/10 border-blue-500/20';
  const titleClass = tone === 'red'
    ? 'text-red-500'
    : tone === 'yellow'
      ? 'text-yellow-500'
      : 'text-blue-400';
  const badgeClass = tone === 'red'
    ? 'bg-red-500 text-white'
    : tone === 'yellow'
      ? 'bg-yellow-500 text-black'
      : 'bg-blue-500 text-white';

  return (
    <div className={cn("p-5 rounded-2xl border", toneClass)}>
      <div className="flex justify-between items-center mb-2">
        <span className={cn("text-[10px] font-bold uppercase tracking-[0.25em]", titleClass)}>{title}</span>
        <span className={cn("text-[10px] px-2 py-0.5 rounded font-black", badgeClass)}>{badge}</span>
      </div>
      <p className="text-xs text-white/80 leading-relaxed">{body}</p>
    </div>
  );
};
