import { HIGH_MIN, LOW_MAX } from '@/lib/map-theme'

const fmt = (n: number) => n.toFixed(2)

/** Key for the dashboard map: ward demand bands and marker symbols. Rendered inside .map. */
export default function MapLegend({ hourLabel, showSimulated }: { hourLabel: string; showSimulated: boolean }) {
  return (
    <div className="map-legend" aria-label="Map legend">
      <div className="map-legend-section" title={`High: risk score > ${fmt(HIGH_MIN)}\nMedium: ${fmt(LOW_MAX)} to ${fmt(HIGH_MIN)}\nLow: < ${fmt(LOW_MAX)}`}>
        <p className="map-legend-title">Ward demand at {hourLabel}</p>
        <span><i className="legend-swatch demand-high" /> High</span>
        <span><i className="legend-swatch demand-medium" /> Medium</span>
        <span><i className="legend-swatch demand-low" /> Low</span>
      </div>
      <div className="map-legend-section">
        <span><i className="legend-symbol legend-hospital" /> Hospital</span>
        <span><i className="legend-symbol legend-als" /> ALS</span>
        <span><i className="legend-symbol legend-bls" /> BLS</span>
        {showSimulated && <span><i className="legend-symbol legend-simulated" /> Simulated</span>}
      </div>
    </div>
  )
}
