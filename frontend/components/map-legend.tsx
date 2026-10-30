import { HIGH_MIN, LOW_MAX } from '@/lib/map-theme'

const fmt = (n: number) => n.toFixed(2)

export default function MapLegend({ showSimulated }: { showSimulated: boolean; hourLabel?: string }) {
  return (
    <div className="map-legend-strip" aria-label="Map legend">
      <div className="map-legend-group">
        <span className="legend-label">Demand:</span>
        <span className="legend-item"><i className="legend-swatch demand-high" /> High</span>
        <span className="legend-item"><i className="legend-swatch demand-medium" /> Medium</span>
        <span className="legend-item"><i className="legend-swatch demand-low" /> Low</span>
      </div>
      <div className="map-legend-group">
        <span className="legend-item"><i className="legend-symbol legend-hospital" /> Hospital</span>
        <span className="legend-item"><i className="legend-symbol legend-als" /> ALS</span>
        <span className="legend-item"><i className="legend-symbol legend-bls" /> BLS</span>
        {showSimulated && <span className="legend-item"><i className="legend-symbol legend-simulated" /> Simulated</span>}
      </div>
    </div>
  )
}
