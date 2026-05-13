import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Activity, BarChart3, CalendarDays, CloudRain, PlaneTakeoff, RefreshCw, Route, TimerReset, Wind } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  DelayDatasetMode,
  DelayDatesResponse,
  DelayFlightBreakdown,
  DelayMetadata,
  DelayScenarioDefaults,
  DelaySimulationResult,
} from '../types';
import { getDelayDates, getDelayMetadata, runDelaySimulation } from '../services/delayEngine';

const numberFormatter = new Intl.NumberFormat('en-IN');

const formatMinutes = (value: number) => `${value.toFixed(1)} min`;
const formatClock = (value?: string | null) => {
  if (!value) {
    return 'N/A';
  }

  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatDateLabel = (value?: string | null) => {
  if (!value) {
    return 'No date';
  }
  return new Date(value).toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

type SimulationOverrideState = DelayScenarioDefaults;

const buildDefaultOverrides = (defaults?: DelayScenarioDefaults | null): SimulationOverrideState => ({
  wind_speed_kmh: defaults?.wind_speed_kmh ?? 0,
  precipitation_mm: defaults?.precipitation_mm ?? 0,
  visibility_m: defaults?.visibility_m ?? 0,
});

export const DelayPropagationSection: React.FC = () => {
  const [metadata, setMetadata] = useState<DelayMetadata | null>(null);
  const [datesResponse, setDatesResponse] = useState<DelayDatesResponse | null>(null);
  const [result, setResult] = useState<DelaySimulationResult | null>(null);
  const [selectedMode, setSelectedMode] = useState<DelayDatasetMode>('demo');
  const [selectedTail, setSelectedTail] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedFlightId, setSelectedFlightId] = useState<string>('');
  const [overridesEnabled, setOverridesEnabled] = useState(false);
  const [overrides, setOverrides] = useState<SimulationOverrideState>(buildDefaultOverrides());
  const [metaLoading, setMetaLoading] = useState(true);
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setMetaLoading(true);
    setError(null);

    getDelayMetadata(selectedMode)
      .then((payload) => {
        if (!active) {
          return;
        }

        const availableTailIds = payload.tails.map((tail) => tail.value);
        setMetadata(payload);
        setSelectedMode(payload.mode);
        setSelectedTail((current) => (
          current && availableTailIds.includes(current)
            ? current
            : payload.default_tail || payload.tails[0]?.value || ''
        ));
      })
      .catch((nextError) => {
        if (!active) {
          return;
        }
        setError(nextError instanceof Error ? nextError.message : 'Failed to load delay metadata.');
      })
      .finally(() => {
        if (active) {
          setMetaLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedMode]);

  useEffect(() => {
    if (!selectedTail) {
      return;
    }

    let active = true;
    setScenarioLoading(true);
    setError(null);

    getDelayDates(selectedMode, selectedTail)
      .then((payload) => {
        if (!active) {
          return;
        }

        setDatesResponse(payload);
        setSelectedDate((current) => {
          if (current && payload.dates.includes(current)) {
            return current;
          }
          return payload.default_date ?? '';
        });
        setOverrides(buildDefaultOverrides(payload.defaults));
      })
      .catch((nextError) => {
        if (!active) {
          return;
        }
        setError(nextError instanceof Error ? nextError.message : 'Failed to load delay dates.');
      })
      .finally(() => {
        if (active) {
          setScenarioLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedMode, selectedTail]);

  useEffect(() => {
    if (!selectedTail || !selectedDate) {
      return;
    }

    void handleRunSimulation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTail, selectedDate]);

  const handleRunSimulation = async () => {
    if (!selectedTail || !selectedDate) {
      return;
    }

    setSimulationLoading(true);
    setError(null);

    try {
      const payload = await runDelaySimulation({
        mode: selectedMode,
        tail: selectedTail,
        date: selectedDate,
        overrides: overridesEnabled ? overrides : undefined,
      });
      setResult(payload);
      setSelectedFlightId((current) => (
        current && payload.flights.some((flight) => flight.id === current)
          ? current
          : payload.flights[0]?.id || ''
      ));
      setDatesResponse((current) => current ? {
        ...current,
        dates: payload.available_dates,
        default_date: payload.selected_date,
        defaults: payload.defaults,
      } : current);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to simulate delay propagation.');
    } finally {
      setSimulationLoading(false);
    }
  };

  const selectedFlight = useMemo(
    () => result?.flights.find((flight) => flight.id === selectedFlightId) ?? result?.flights[0] ?? null,
    [result, selectedFlightId],
  );

  const timelineBounds = useMemo(() => {
    const items = result?.timeline ?? [];
    const timestamps = items.flatMap((item) => [
      item.scheduled_departure ? Date.parse(item.scheduled_departure) : null,
      item.scheduled_arrival ? Date.parse(item.scheduled_arrival) : null,
      item.predicted_departure ? Date.parse(item.predicted_departure) : null,
      item.predicted_arrival ? Date.parse(item.predicted_arrival) : null,
    ]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

    const start = timestamps.length > 0 ? Math.min(...timestamps) : Date.now();
    const end = timestamps.length > 0 ? Math.max(...timestamps) : start + 1;
    return {
      start,
      end: end === start ? start + 1 : end,
    };
  }, [result]);

  const getTimelineStyle = (startValue?: string | null, endValue?: string | null) => {
    const start = startValue ? Date.parse(startValue) : timelineBounds.start;
    const end = endValue ? Date.parse(endValue) : timelineBounds.end;
    const range = timelineBounds.end - timelineBounds.start;
    const left = ((start - timelineBounds.start) / range) * 100;
    const width = Math.max(((end - start) / range) * 100, 3);
    return {
      left: `${Math.max(left, 0)}%`,
      width: `${Math.min(width, 100)}%`,
    };
  };

  const maxTotalDelay = useMemo(
    () => Math.max(...(result?.flights.map((flight) => flight.final_delay) ?? [1])),
    [result],
  );

  const summaryCards = result ? [
    {
      label: 'Total Flights',
      value: numberFormatter.format(result.summary.total_flights),
      accent: 'text-cyan-300',
      icon: <Route size={18} />,
    },
    {
      label: 'Cumulative Delay',
      value: formatMinutes(result.summary.cumulative_delay),
      accent: 'text-red-300',
      icon: <TimerReset size={18} />,
    },
    {
      label: 'Max Single Delay',
      value: formatMinutes(result.summary.max_delay),
      accent: 'text-yellow-300',
      icon: <Activity size={18} />,
    },
    {
      label: 'Average Delay',
      value: formatMinutes(result.summary.average_delay),
      accent: 'text-blue-300',
      icon: <BarChart3 size={18} />,
    },
  ] : [];

  return (
    <section id="delay-section" className="min-h-screen py-24 px-8 max-w-7xl mx-auto relative z-10 scroll-mt-28">
      <div className="absolute inset-0 bg-cyan-500/10 blur-[120px] rounded-full pointer-events-none" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="mb-16 relative z-10"
      >
        <span className="text-cyan-400 font-bold tracking-[0.3em] uppercase text-xs">Sequential Impact Engine</span>
        <h2 className="text-6xl font-black tracking-tighter mt-4 mb-6 text-white">Delay Propagation</h2>
        <p className="text-white/75 text-xl max-w-3xl font-light leading-relaxed">
          Chain-level simulation of how one aircraft rotation delay compounds through scheduled departures, turnarounds, congestion, and weather stress.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 xl:grid-cols-[22rem,minmax(0,1fr)] gap-8 relative z-10">
        <div className="rounded-[2rem] border border-cyan-400/15 bg-slate-950/96 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-2xl bg-cyan-500/10 border border-cyan-400/15 flex items-center justify-center text-cyan-300">
              <PlaneTakeoff size={18} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300">Scenario Controls</p>
              <h3 className="text-xl font-semibold text-white mt-2">Delay chain setup</h3>
            </div>
          </div>

          <div className="space-y-5">
            <ControlBlock label="Dataset mode">
              <div className="grid grid-cols-2 gap-2">
                {(metadata?.modes ?? []).map((modeOption) => (
                  <button
                    key={modeOption.value}
                    type="button"
                    onClick={() => setSelectedMode(modeOption.value)}
                    className={cn(
                      "rounded-2xl border px-3 py-3 text-xs uppercase tracking-[0.2em] transition-colors",
                      selectedMode === modeOption.value
                        ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-200"
                        : "border-white/10 bg-white/5 text-white/55 hover:bg-white/10",
                    )}
                  >
                    {modeOption.label}
                  </button>
                ))}
              </div>
            </ControlBlock>

            <ControlBlock label="Aircraft tail">
              <select
                value={selectedTail}
                onChange={(event) => setSelectedTail(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
                disabled={metaLoading || simulationLoading}
              >
                {(metadata?.tails ?? []).map((tail) => (
                  <option key={tail.value} value={tail.value} className="bg-slate-950">
                    {tail.label}
                  </option>
                ))}
              </select>
            </ControlBlock>

            <ControlBlock label="Simulation date">
              <div className="relative">
                <CalendarDays size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/35" />
                <select
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 pl-11 pr-4 py-3 text-sm text-white outline-none"
                  disabled={scenarioLoading || simulationLoading}
                >
                  {(datesResponse?.dates ?? []).map((dateOption) => (
                    <option key={dateOption} value={dateOption} className="bg-slate-950">
                      {formatDateLabel(dateOption)}
                    </option>
                  ))}
                </select>
              </div>
            </ControlBlock>

            <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
              <label className="flex items-center justify-between gap-4 cursor-pointer">
                <div>
                  <p className="text-sm font-medium text-white">Weather override</p>
                  <p className="text-xs text-white/45 mt-1">Adjust the first flight’s wind, precipitation, and visibility inputs.</p>
                </div>
                <input
                  type="checkbox"
                  checked={overridesEnabled}
                  onChange={(event) => setOverridesEnabled(event.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-white/10"
                />
              </label>

              <div className={cn("mt-4 space-y-4", !overridesEnabled && "opacity-45 pointer-events-none")}>
                <RangeControl
                  label="Wind speed"
                  icon={<Wind size={14} />}
                  value={overrides.wind_speed_kmh}
                  min={0}
                  max={150}
                  step={1}
                  suffix="km/h"
                  onChange={(value) => setOverrides((current) => ({ ...current, wind_speed_kmh: value }))}
                />
                <RangeControl
                  label="Precipitation"
                  icon={<CloudRain size={14} />}
                  value={overrides.precipitation_mm}
                  min={0}
                  max={50}
                  step={0.5}
                  suffix="mm"
                  onChange={(value) => setOverrides((current) => ({ ...current, precipitation_mm: value }))}
                />
                <RangeControl
                  label="Visibility"
                  icon={<Activity size={14} />}
                  value={overrides.visibility_m}
                  min={0}
                  max={10000}
                  step={100}
                  suffix="m"
                  onChange={(value) => setOverrides((current) => ({ ...current, visibility_m: value }))}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleRunSimulation}
              disabled={simulationLoading || !selectedTail || !selectedDate}
              className="w-full rounded-2xl border border-cyan-400/30 bg-cyan-500/15 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-100 transition-colors hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {simulationLoading ? 'Running Simulation...' : 'Run Delay Simulation'}
            </button>

            {error && (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {summaryCards.map((card) => (
              <div key={card.label} className="rounded-[1.6rem] border border-white/10 bg-slate-950/96 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
                <div className="flex items-center justify-between gap-4">
                  <span className={cn("inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5", card.accent)}>
                    {card.icon}
                  </span>
                </div>
                <p className="mt-5 text-[10px] uppercase tracking-[0.25em] text-white/35">{card.label}</p>
                <p className="mt-2 text-3xl font-bold tracking-tight text-white">{card.value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-slate-950/96 p-6 md:p-8 shadow-[0_24px_80px_rgba(0,0,0,0.42)]">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300">Aircraft Rotation Timeline</p>
                  <h3 className="text-2xl font-semibold text-white mt-2">
                    {result ? `${result.tail_label} on ${formatDateLabel(result.selected_date)}` : 'Delay chain timeline'}
                  </h3>
                </div>
              <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-white/45">
                <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-blue-400" />Scheduled</span>
                <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-red-400" />Predicted actual</span>
                {result?.engine_mode && (
                  <span className={cn(
                    "rounded-full border px-2 py-1 text-[10px] tracking-[0.2em]",
                    result.engine_mode === 'ml'
                      ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200"
                      : "border-amber-400/25 bg-amber-500/10 text-amber-200",
                  )}>
                    {result.engine_mode === 'ml' ? 'ML' : 'Fallback'}
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-4">
              {(result?.timeline ?? []).map((item) => (
                <div key={item.id} className="grid grid-cols-[7.5rem,minmax(0,1fr)] gap-4 items-center">
                  <div>
                    <p className="text-sm font-semibold text-white">{item.label}</p>
                    <p className="text-xs text-white/45 mt-1 leading-5">{item.route}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                    <div className="relative h-12 rounded-xl bg-black/30 overflow-hidden">
                      <div
                        className="absolute top-2 h-3 rounded-full bg-blue-400/75"
                        style={getTimelineStyle(item.scheduled_departure, item.scheduled_arrival)}
                      />
                      <div
                        className="absolute bottom-2 h-3 rounded-full bg-red-400/80"
                        style={getTimelineStyle(item.predicted_departure, item.predicted_arrival)}
                      />
                    </div>
                    <div className="mt-3 flex items-center justify-between text-[11px] text-white/45">
                      <span>Sched {formatClock(item.scheduled_departure)} - {formatClock(item.scheduled_arrival)}</span>
                      <span>Pred {formatClock(item.predicted_departure)} - {formatClock(item.predicted_arrival)}</span>
                    </div>
                  </div>
                </div>
              ))}

              {!simulationLoading && !result && !error && (
                <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-8 text-center text-white/45">
                  Load a delay scenario to populate the timeline, delay breakdown, and driver analysis.
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr),minmax(0,0.8fr)] gap-8">
            <div className="rounded-[2rem] border border-white/10 bg-slate-950/96 p-6 md:p-8 shadow-[0_24px_80px_rgba(0,0,0,0.42)]">
              <div className="flex items-center justify-between gap-4 mb-6">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300">Delay Breakdown</p>
                  <h3 className="text-2xl font-semibold text-white mt-2">Base vs propagation vs spill</h3>
                </div>
                <span className="text-[11px] uppercase tracking-[0.2em] text-white/35">Per flight chain</span>
              </div>

              <div className="space-y-5">
                {(result?.flights ?? []).map((flight) => {
                  const total = Math.max(flight.base_delay + flight.propagation_delay + flight.spill_delay, 1);
                  const scale = Math.max(flight.final_delay / maxTotalDelay, 0.08);
                  return (
                    <button
                      key={flight.id}
                      type="button"
                      onClick={() => setSelectedFlightId(flight.id)}
                      className={cn(
                        "w-full rounded-[1.5rem] border px-4 py-4 text-left transition-colors",
                        selectedFlight?.id === flight.id
                          ? "border-cyan-400/30 bg-cyan-500/10"
                          : "border-white/10 bg-white/5 hover:bg-white/8",
                      )}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-white">{flight.route}</p>
                          <p className="text-xs text-white/45 mt-1">Flight {flight.sequence} • cumulative {formatMinutes(flight.cumulative_delay)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs uppercase tracking-[0.18em] text-white/35">Final delay</p>
                          <p className="text-lg font-semibold text-red-200">{formatMinutes(flight.final_delay)}</p>
                        </div>
                      </div>

                      <div className="mt-4 h-3 rounded-full bg-black/30 overflow-hidden" style={{ width: `${Math.min(scale * 100, 100)}%` }}>
                        <div className="flex h-full">
                          <div className="bg-orange-400/90" style={{ width: `${(flight.base_delay / total) * 100}%` }} />
                          <div className="bg-violet-400/90" style={{ width: `${(flight.propagation_delay / total) * 100}%` }} />
                          <div className="bg-cyan-400/90" style={{ width: `${(flight.spill_delay / total) * 100}%` }} />
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-3 text-[11px] text-white/45">
                        <span>Base {formatMinutes(flight.base_delay)}</span>
                        <span>Propagation {formatMinutes(flight.propagation_delay)}</span>
                        <span>Spill {formatMinutes(flight.spill_delay)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-8">
              <div className="rounded-[2rem] border border-white/10 bg-slate-950/96 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.42)]">
                <div className="flex items-center justify-between gap-4 mb-5">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300">Driver Analysis</p>
                    <h3 className="text-xl font-semibold text-white mt-2">
                      {selectedFlight ? `Flight ${selectedFlight.sequence}` : 'Awaiting simulation'}
                    </h3>
                  </div>
                  <RefreshCw size={16} className={cn("text-white/35", simulationLoading && "animate-spin")} />
                </div>

                {selectedFlight ? (
                  <div className="space-y-4">
                    <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                      <p className="text-sm font-semibold text-white">{selectedFlight.route}</p>
                      <p className="text-xs text-white/45 mt-2 leading-6">
                        Predicted departure {formatClock(selectedFlight.predicted_departure)} and arrival {formatClock(selectedFlight.predicted_arrival)}.
                      </p>
                    </div>

                    {selectedFlight.drivers.map((driver) => (
                      <div key={`${selectedFlight.id}-${driver.feature}`} className="rounded-[1.25rem] border border-white/10 bg-white/5 px-4 py-3">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold text-white">{driver.label}</p>
                            <p className="text-[11px] text-white/45 mt-1">{driver.value}</p>
                          </div>
                          <span
                            className={cn(
                              "text-xs uppercase tracking-[0.2em]",
                              driver.direction === 'increase' ? 'text-red-300' : 'text-emerald-300',
                            )}
                          >
                            {driver.direction === 'increase' ? '+' : ''}{driver.impact.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-6 text-sm text-white/45">
                    Run a scenario to view XGBoost driver contributions and the most influential operational conditions.
                  </div>
                )}
              </div>

              <div className="rounded-[2rem] border border-white/10 bg-slate-950/96 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.42)]">
                <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300">Flight Chain Log</p>
                <div className="mt-5 space-y-4 max-h-[28rem] overflow-auto pr-1">
                  {(result?.flights ?? []).map((flight) => (
                    <div key={`log-${flight.id}`} className="rounded-[1.4rem] border border-white/10 bg-white/5 px-4 py-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-white">{flight.route}</p>
                          <p className="text-[11px] text-white/45 mt-1">{formatDateLabel(flight.scheduled_departure)}</p>
                        </div>
                        <span className="text-sm font-semibold text-red-200">{formatMinutes(flight.final_delay)}</span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 text-[11px] text-white/45">
                        <span>Base {formatMinutes(flight.base_delay)}</span>
                        <span>Propagation {formatMinutes(flight.propagation_delay)}</span>
                        <span>Spill {formatMinutes(flight.spill_delay)}</span>
                        <span>Cumulative {formatMinutes(flight.cumulative_delay)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

const ControlBlock: React.FC<{
  label: string;
  children: React.ReactNode;
}> = ({ label, children }) => (
  <div>
    <p className="text-[10px] uppercase tracking-[0.25em] text-white/35 mb-3">{label}</p>
    {children}
  </div>
);

const RangeControl: React.FC<{
  label: string;
  icon: React.ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}> = ({ label, icon, value, min, max, step, suffix, onChange }) => (
  <div>
    <div className="flex items-center justify-between gap-4 text-xs text-white/60">
      <span className="inline-flex items-center gap-2">{icon}{label}</span>
      <span>{value.toFixed(suffix === 'm' ? 0 : 1)} {suffix}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="mt-2 w-full accent-cyan-400"
    />
  </div>
);
