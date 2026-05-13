import React from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, ShieldCheck, Radar, TrendingUp, Activity, Sparkles, Cloud, Wind } from 'lucide-react';
import { cn } from '../lib/utils';
import { Conflict, DashboardAnalysis, Flight } from '../types';

interface StatsSectionProps {
  analysis: DashboardAnalysis | null;
  flights: Flight[];
  futureConflicts: Conflict[];
}

const formatDistanceKm = (distanceKm: number) =>
  distanceKm < 0.1 ? `${distanceKm.toFixed(3)} km` : `${distanceKm.toFixed(2)} km`;

export const StatsSection: React.FC<StatsSectionProps> = ({ analysis, flights, futureConflicts }) => {
  const conflictCount = flights.filter((flight) => flight.status === 'conflict').length;
  const totalFlights = analysis?.total_flights ?? flights.length;
  const delayedFlights = flights.filter((flight) => (flight.delayMinutes ?? 0) > 0).length;
  const hotspots = analysis?.density_hotspots ?? [];
  const trafficDensity = hotspots[0]?.count
    ? `${hotspots[0].count} in top cell`
    : totalFlights > 0
      ? 'Distributed'
      : 'No traffic';
  const averageVelocity = analysis?.average_velocity
    ? `${analysis.average_velocity.toFixed(0)} kts`
    : 'No telemetry';
  const briefing = analysis?.briefing;
  const weatherZones = analysis?.weather_zones ?? [];
  const turbulenceZones = analysis?.turbulence_zones ?? [];
  const futureLead = futureConflicts[0];
  const futureLeadLabel = futureLead
    ? `${futureLead.location.place} step ${futureLead.step ?? 1}`
    : 'Clear horizon';

  const hazardItems = [
    {
      type: 'Conflict Risk',
      location: conflictCount > 0
        ? `${conflictCount} aircraft are currently inside live separation checks.`
        : 'No active backend conflict alerts are visible in the current snapshot.',
      risk: conflictCount > 0 ? 'High' : 'Low',
    },
    {
      type: 'Future Conflict Watch',
      location: futureLead
        ? `${futureConflicts.length} predicted pairs are led by ${futureLead.location.place} in ${futureLead.location.zone}.`
        : 'No forecast conflict intersections are currently projected.',
      risk: futureConflicts.length > 0 ? 'Medium' : 'Low',
    },
    {
      type: 'Weather Flow Filter',
      location: weatherZones[0]
        ? `${weatherZones[0].place} is showing compressed movement across ${weatherZones[0].flight_count} tracked flights.`
        : 'No weather overlay zone is currently being emphasized.',
      risk: weatherZones[0]?.severity ? capitalize(weatherZones[0].severity) : 'Low',
    },
    {
      type: 'Turbulence Filter',
      location: turbulenceZones[0]
        ? `${turbulenceZones[0].place} is showing elevated vertical motion variance across ${turbulenceZones[0].flight_count} flights.`
        : 'No rough-air pattern is currently dominant in the active snapshot.',
      risk: turbulenceZones[0]?.severity ? capitalize(turbulenceZones[0].severity) : 'Low',
    },
    {
      type: 'Delay Signals',
      location: delayedFlights > 0
        ? `${delayedFlights} flights have delay minutes reported by the backend.`
        : 'No backend delay values are currently available.',
      risk: delayedFlights > 0 ? 'Medium' : 'Low',
    },
  ];

  return (
    <section className="min-h-screen py-24 px-8 max-w-7xl mx-auto relative z-10 scroll-mt-28">
      <div className="absolute inset-0 bg-blue-500/10 blur-[120px] rounded-full pointer-events-none" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="mb-16 relative z-10"
      >
        <h2 className="text-6xl font-black tracking-tighter mb-4 gradient-text">System Intelligence</h2>
        <p className="text-white text-xl max-w-2xl font-light leading-relaxed">
          Real-time propagation modeling and explainable analytics for global air traffic management.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          icon={<AlertTriangle className="text-red-500" />}
          label="Active Conflicts"
          value={conflictCount.toString()}
          trend="Live"
        />
        <StatCard
          icon={<ShieldCheck className="text-green-500" />}
          label="Total Flights"
          value={totalFlights.toString()}
          trend="Syncing"
        />
        <StatCard
          icon={<Radar className="text-yellow-400" />}
          label="Future Conflicts"
          value={futureConflicts.length.toString()}
          trend={futureLeadLabel}
        />
        <StatCard
          icon={<TrendingUp className="text-cyan-400" />}
          label="Traffic Density"
          value={trafficDensity}
          trend={averageVelocity}
        />
      </div>

      <div className="mt-12 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass p-8 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-cyan-400/10 opacity-70 pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20">
                <Sparkles size={20} className="text-blue-300" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-blue-300">Explainable AI Briefing</p>
                <h3 className="text-2xl font-semibold mt-2">
                  {briefing?.headline ?? 'No briefing available yet'}
                </h3>
              </div>
            </div>

            <p className="text-sm text-white/70 leading-7 max-w-4xl">
              {briefing?.summary ?? 'The backend has not produced a traffic explanation yet.'}
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              {(briefing?.zone_focus ?? []).length > 0 ? (
                briefing.zone_focus.map((zone) => (
                  <span
                    key={zone}
                    className="px-3 py-2 rounded-full border border-white/10 bg-white/5 text-xs uppercase tracking-[0.2em] text-white/70"
                  >
                    {zone}
                  </span>
                ))
              ) : (
                <span className="px-3 py-2 rounded-full border border-white/10 bg-white/5 text-xs uppercase tracking-[0.2em] text-white/45">
                  Waiting for zone signals
                </span>
              )}
            </div>

            <div className="mt-8 grid md:grid-cols-2 gap-6">
              <div className="glass p-6">
                <p className="text-[10px] text-white/40 uppercase tracking-wider mb-3">Key Drivers</p>
                <div className="space-y-4">
                  {(briefing?.key_drivers ?? []).length > 0 ? (
                    briefing?.key_drivers.map((driver) => (
                      <div key={driver.label} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <div className="flex items-center justify-between gap-4">
                          <p className="text-sm font-semibold text-white">{driver.label}</p>
                          <span className="text-xs uppercase tracking-[0.2em] text-blue-300">{driver.value}</span>
                        </div>
                        <p className="text-xs text-white/50 mt-2 leading-6">{driver.impact}</p>
                      </div>
                    ))
                  ) : (
                    <EmptyPanel icon={<Activity size={34} />} label="No driver breakdown available yet." />
                  )}
                </div>
              </div>

              <div className="glass p-6">
                <p className="text-[10px] text-white/40 uppercase tracking-wider mb-3">Future Conflict Details</p>
                <div className="space-y-4">
                  {futureConflicts.length > 0 ? futureConflicts.slice(0, 4).map((conflict) => (
                    <div key={conflict.id} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-white">{conflict.location.place}</p>
                          <p className="text-xs uppercase tracking-[0.18em] text-white/40 mt-1">{conflict.location.zone}</p>
                        </div>
                        <span className="text-sm font-semibold text-yellow-300">step {conflict.step ?? 1}</span>
                      </div>
                      <p className="text-xs text-white/45 mt-2 leading-6">
                        {formatDistanceKm(conflict.dist)} predicted separation between {conflict.id1.toUpperCase()} and {conflict.id2.toUpperCase()}.
                      </p>
                    </div>
                  )) : (
                    <EmptyPanel icon={<Radar size={34} />} label="No future conflict intersections are projected right now." />
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 grid md:grid-cols-2 gap-6">
              <InsightCard
                icon={<Cloud size={18} className="text-blue-300" />}
                title="Weather Filter"
                description={weatherZones[0]?.summary ?? 'No weather overlay zone is available yet. Add your API key in backend/src/weather_service.py or SKYGUARD_WEATHER_API_KEY.'}
              />
              <InsightCard
                icon={<Wind size={18} className="text-orange-300" />}
                title="Turbulence Filter"
                description={turbulenceZones[0]?.summary ?? 'Telemetry has not highlighted a dominant rough-air cell yet.'}
              />
            </div>

            <div className="mt-6 glass p-6">
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-3">Recommended Actions</p>
              <div className="space-y-3">
                {(briefing?.recommended_actions ?? []).length > 0 ? (
                  briefing?.recommended_actions.map((action) => (
                    <div key={action} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70 leading-7">
                      {action}
                    </div>
                  ))
                ) : (
                  <EmptyPanel icon={<Radar size={34} />} label="No action guidance is available yet." />
                )}
              </div>
            </div>
          </div>
        </div>

        <div id="hazards-section" className="glass p-8 flex flex-col scroll-mt-28">
          <h3 className="text-2xl font-semibold mb-6">Hazard Alerts</h3>
          <div className="space-y-4 overflow-y-auto pr-2">
            {hazardItems.map((item) => (
              <HazardItem
                key={item.type}
                type={item.type}
                location={item.location}
                risk={item.risk}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

const StatCard = ({ icon, label, value, trend }: any) => (
  <motion.div
    whileHover={{ y: -5 }}
    className="glass p-8 flex flex-col gap-4 group cursor-pointer"
  >
    <div className="flex justify-between items-start gap-3">
      <div className="p-3 rounded-xl bg-white/10 group-hover:bg-white/20 transition-colors">
        {icon}
      </div>
      <span className="text-[11px] font-medium px-2 py-1 rounded-full bg-white/10 text-white/80 text-right leading-4">
        {trend}
      </span>
    </div>
    <div>
      <p className="text-sm text-white/60 uppercase tracking-wider">{label}</p>
      <p className="text-4xl font-bold mt-1 tracking-tighter text-white">{value}</p>
    </div>
  </motion.div>
);

const HazardItem = ({ type, location, risk }: any) => (
  <div className="p-4 rounded-xl bg-white/5 border border-white/5 flex justify-between items-center gap-4">
    <div>
      <p className="font-medium">{type}</p>
      <p className="text-xs text-white/40 leading-6">{location}</p>
    </div>
    <span className={cn(
      "text-[10px] font-bold uppercase px-2 py-1 rounded shrink-0",
      risk === 'High' ? 'bg-red-500/20 text-red-500' :
      risk === 'Medium' ? 'bg-yellow-500/20 text-yellow-500' : 'bg-blue-500/20 text-blue-500',
    )}>
      {risk} Risk
    </span>
  </div>
);

const InsightCard = ({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) => (
  <div className="glass p-5">
    <div className="flex items-center gap-3 mb-3">
      <div className="p-2 rounded-xl bg-white/10">{icon}</div>
      <p className="text-sm font-semibold text-white">{title}</p>
    </div>
    <p className="text-sm text-white/55 leading-7">{description}</p>
  </div>
);

const EmptyPanel = ({ icon, label }: { icon: React.ReactNode; label: string }) => (
  <div className="flex items-center justify-center min-h-[10rem] text-white/20">
    <div className="text-center max-w-xs">
      <div className="mx-auto mb-4 opacity-20">{icon}</div>
      <p>{label}</p>
    </div>
  </div>
);

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
