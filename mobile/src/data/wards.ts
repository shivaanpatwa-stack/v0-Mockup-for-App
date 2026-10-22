// Ward centroids come from frontend/public/data/zones_full_features_final.geojson (projected to
// EPSG:32643 for the centroid, then back to WGS84). Area names are the usual BMC ward neighbourhoods;
// double-check them if they matter for your users.
export type Ward = { code: string; name: string; lat: number; lng: number }

export const WARDS: Ward[] = [
  { code: 'A', name: 'Colaba', lat: 18.92314, lng: 72.82500 },
  { code: 'B', name: 'Dongri', lat: 18.95636, lng: 72.84014 },
  { code: 'C', name: 'Marine Lines', lat: 18.95111, lng: 72.82737 },
  { code: 'D', name: 'Grant Road', lat: 18.96234, lng: 72.81005 },
  { code: 'E', name: 'Byculla', lat: 18.97398, lng: 72.83650 },
  { code: 'F/S', name: 'Parel', lat: 18.99838, lng: 72.84931 },
  { code: 'G/S', name: 'Worli', lat: 18.99828, lng: 72.82175 },
  { code: 'F/N', name: 'Matunga', lat: 19.02769, lng: 72.86618 },
  { code: 'G/N', name: 'Dadar', lat: 19.03404, lng: 72.84517 },
  { code: 'N', name: 'Ghatkopar', lat: 19.08709, lng: 72.92531 },
  { code: 'R/C', name: 'Borivali', lat: 19.23125, lng: 72.84299 },
  { code: 'S', name: 'Bhandup', lat: 19.13288, lng: 72.92943 },
  { code: 'T', name: 'Mulund', lat: 19.17246, lng: 72.93000 },
  { code: 'K/W', name: 'Andheri West', lat: 19.12624, lng: 72.82740 },
  { code: 'R/N', name: 'Dahisar', lat: 19.25233, lng: 72.85981 },
  { code: 'M/E', name: 'Govandi', lat: 19.03858, lng: 72.92471 },
  { code: 'M/W', name: 'Chembur', lat: 19.03540, lng: 72.89360 },
  { code: 'H/E', name: 'Bandra East', lat: 19.07041, lng: 72.85566 },
  { code: 'K/E', name: 'Andheri East', lat: 19.11382, lng: 72.86549 },
  { code: 'P/S', name: 'Goregaon', lat: 19.15845, lng: 72.85737 },
  { code: 'P/N', name: 'Malad', lat: 19.18437, lng: 72.82682 },
  { code: 'R/S', name: 'Kandivali', lat: 19.20448, lng: 72.86000 },
  { code: 'H/W', name: 'Bandra West', lat: 19.06496, lng: 72.83140 },
  { code: 'L', name: 'Kurla', lat: 19.08755, lng: 72.88667 },
]
