export const WARD_NAMES: Record<string, string> = {
  A: 'Colaba, Fort, Churchgate, Nariman Point',
  B: 'Dongri, Mohammed Ali Road, Mandvi, Bhendi Bazaar',
  C: 'Marine Lines, Bhuleshwar, Pydhonie, Girgaon',
  D: 'Grant Road, Malabar Hill, Girgaon, Walkeshwar, Tardeo',
  E: 'Byculla, Mazgaon, Nagpada, Madanpura',
  'F/S': 'Parel, Lalbaug, Sewri, Naigaon',
  'F/N': 'Matunga, Sion, Wadala',
  'G/S': 'Worli, Prabhadevi, Lower Parel, Mahalaxmi',
  'G/N': 'Dadar, Mahim, Dharavi',
  'H/E': 'Bandra East, Santacruz East, Khar East, Vakola',
  'H/W': 'Bandra West, Khar, Santacruz West',
  'K/E': 'Andheri East, Jogeshwari East, Vile Parle East',
  'K/W': 'Andheri West, Juhu, Versova, Vile Parle West',
  'P/S': 'Goregaon, Aarey',
  'P/N': 'Malad, Dindoshi, Marve',
  'R/S': 'Kandivali',
  'R/C': 'Borivali',
  'R/N': 'Dahisar',
  L: 'Kurla, Chandivali',
  'M/E': 'Govandi, Mankhurd, Chembur East',
  'M/W': 'Chembur, Tilak Nagar',
  N: 'Ghatkopar, Vidyavihar',
  S: 'Bhandup, Kanjurmarg, Powai, Vikhroli',
  T: 'Mulund, Nahur',
}

export function getWardArea(wardCode: string | null | undefined): string | null {
  if (!wardCode) return null
  const cleaned = wardCode.replace(/^Ward\s+/i, '').trim()
  return WARD_NAMES[cleaned] || null
}

export const WARD_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  A: { lat: 18.921433169391914, lng: 72.8237646011064 },
  B: { lat: 18.956282250003028, lng: 72.8398497796797 },
  C: { lat: 18.951638288187127, lng: 72.82740060170333 },
  D: { lat: 18.95969890562118, lng: 72.81182418321275 },
  E: { lat: 18.975137091515702, lng: 72.83595172184863 },
  'F/S': { lat: 18.99761294771919, lng: 72.84663388343937 },
  'G/S': { lat: 19.00261051026799, lng: 72.82300175714506 },
  'F/N': { lat: 19.03006321638607, lng: 72.86528253412993 },
  'G/N': { lat: 19.02983563704572, lng: 72.84392453099579 },
  N: { lat: 19.086526278910696, lng: 72.92171771817574 },
  'R/C': { lat: 19.23307993236025, lng: 72.84406764603754 },
  S: { lat: 19.134845327292755, lng: 72.92507421171148 },
  T: { lat: 19.175642031567538, lng: 72.93352616158458 },
  'K/W': { lat: 19.119107147110796, lng: 72.83319216512115 },
  'R/N': { lat: 19.25371142761577, lng: 72.86013177778017 },
  'M/E': { lat: 19.035162976173442, lng: 72.92422564662903 },
  'M/W': { lat: 19.032502621521314, lng: 72.88805142196703 },
  'H/E': { lat: 19.07289177377, lng: 72.85640137712885 },
  'K/E': { lat: 19.112703856132324, lng: 72.86615267566008 },
  'P/S': { lat: 19.157605998364847, lng: 72.85133460943771 },
  'P/N': { lat: 19.183289918999577, lng: 72.8479401308273 },
  'R/S': { lat: 19.200959140792712, lng: 72.86953918369704 },
  'H/W': { lat: 19.06519031898348, lng: 72.83197763853664 },
  L: { lat: 19.08899109299155, lng: 72.88670176978935 },
}

