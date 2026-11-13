import { DEMAND_DESCRIPTION, type DemandLevel } from '@/lib/map-theme'
import { DATA_LABEL } from '@/lib/config'

const LEVELS: DemandLevel[] = ['low', 'moderate', 'high', 'very-high']

export default function MapLegend({
  showSimulated,
  hourLabel,
}: {
  showSimulated: boolean
  hourLabel?: string
}) {
  return (
    <div className="map-legend-strip" aria-label="Map legend">
      {/* 1. Demand & Risk Bands (Single-hue warm ramp: Sand -> Ochre -> Terracotta -> Deep Brick) */}
      <div className="map-legend-group">
        <span className="legend-label">Demand / Risk:</span>
        {LEVELS.map((level) => {
          const info = DEMAND_DESCRIPTION[level]
          return (
            <span key={level} className="legend-item" title={`Risk Score: ${info.range} (${info.tone})`}>
              <i
                className={`legend-swatch demand-${level}`}
                style={{ backgroundColor: info.colorHex }}
                aria-hidden="true"
              />
              <span className="legend-text">
                {info.label} <small className="legend-tone">({info.tone})</small>
              </span>
            </span>
          )
        })}
      </div>

      {/* 2. Map Symbols: Hospital, Recommended, Deployed, Coverage */}
      <div className="map-legend-group">
        <span className="legend-label">Fleet / Coverage:</span>
        <span className="legend-item" title="Hospital Base">
          <i className="legend-symbol legend-hospital" aria-hidden="true" />
          <span>Hospital</span>
        </span>
        <span className="legend-item" title="Optimal staging recommended by the model">
          <i className="legend-symbol legend-unit-rec" aria-hidden="true">
            01
          </i>
          <span>Recommended</span>
        </span>
        <span className="legend-item" title="Ambulance currently in position">
          <i className="legend-symbol legend-unit-dep" aria-hidden="true">
            02
          </i>
          <span>Currently Deployed</span>
        </span>
        {showSimulated && (
          <span className="legend-item" title="What-if simulated staging position">
            <i className="legend-symbol legend-simulated" aria-hidden="true" />
            <span>Simulated</span>
          </span>
        )}
        <span className="legend-item" title="15-minute road network travel-time isochrone coverage">
          <i className="legend-symbol legend-boundary" aria-hidden="true" />
          <span>15m Isochrone</span>
        </span>
      </div>
      <p className="map-legend-note">{DATA_LABEL}. Demand is a modelled risk score per ward, not recorded calls.</p>
    </div>
  )
}
