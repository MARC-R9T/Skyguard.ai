import React from 'react';
import { motion } from 'motion/react';
import { X, Plane, Clock, Navigation, Wind, Fuel, Activity } from 'lucide-react';
import { Flight } from '../types';
import { cn } from '../lib/utils';

interface FlightDetailsProps {
  flight: Flight | null;
  onClose: () => void;
}

export const FlightDetails: React.FC<FlightDetailsProps> = ({ flight, onClose }) => {
  if (!flight) return null;

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      className="fixed right-0 top-0 h-full w-96 glass-dark z-50 p-8 flex flex-col gap-8 shadow-2xl"
    >
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tighter">{flight.callsign}</h2>
          <p className="text-white/50 text-sm">Live Flight Tracking</p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
          <X size={24} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="glass p-4">
          <p className="text-xs text-white/40 uppercase mb-1">Current Position</p>
          <p className="text-xl font-semibold">{flight.origin.code}</p>
          <p className="text-xs text-white/60">{flight.origin.city}</p>
          {flight.origin.zone && (
            <p className="text-[11px] text-white/35 mt-2">{flight.origin.zone}</p>
          )}
        </div>
        <div className="glass p-4">
          <p className="text-xs text-white/40 uppercase mb-1">Projected Path</p>
          <p className="text-xl font-semibold">{flight.destination.code}</p>
          <p className="text-xs text-white/60">{flight.destination.city}</p>
          {flight.destination.zone && (
            <p className="text-[11px] text-white/35 mt-2">{flight.destination.zone}</p>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <DetailItem icon={<Activity size={18} />} label="Status" value={flight.status} color={
          flight.status === 'delayed' ? 'text-red-500' : 
          flight.status === 'conflict' ? 'text-yellow-500' : 'text-blue-500'
        } />
        <DetailItem icon={<Navigation size={18} />} label="Altitude" value={`${flight.altitude.toLocaleString()} ft`} />
        <DetailItem icon={<Wind size={18} />} label="Velocity" value={`${flight.velocity} kts`} />
        <DetailItem icon={<Plane size={18} />} label="Updated" value={new Date(flight.lastUpdate).toLocaleString()} />
        {flight.locationLabel && (
          <DetailItem icon={<Navigation size={18} />} label="Zone" value={flight.locationLabel} />
        )}
        {flight.delayMinutes && (
          <DetailItem icon={<Clock size={18} />} label="Delay" value={`${flight.delayMinutes} mins`} color="text-red-500" />
        )}
        {flight.futureConflict && (
          <DetailItem icon={<Activity size={18} />} label="Forecast" value="Future conflict watch" color="text-yellow-400" />
        )}
      </div>

      <div className="mt-auto">
        <div className="glass p-6 space-y-4">
          <h3 className="font-medium flex items-center gap-2">
            <Fuel size={18} className="text-blue-400" />
            Backend Forecast
          </h3>
          <p className="text-xs text-white/60 leading-relaxed">
            {flight.prediction && flight.prediction.length > 0
              ? `${flight.prediction.length} predicted trajectory points are available from the backend model for this aircraft.`
              : 'No trajectory forecast is available for this aircraft yet. Prediction needs enough history in the backend log.'}
          </p>
          <button className="w-full py-3 apple-gradient-blue rounded-xl font-medium text-sm hover:opacity-90 transition-opacity">
            Review Telemetry
          </button>
        </div>
      </div>
    </motion.div>
  );
};

const DetailItem = ({ icon, label, value, color = "text-white" }: any) => (
  <div className="flex items-center justify-between py-2 border-b border-white/5">
    <div className="flex items-center gap-3 text-white/60">
      {icon}
      <span className="text-sm">{label}</span>
    </div>
    <span className={cn("font-medium capitalize", color)}>{value}</span>
  </div>
);
