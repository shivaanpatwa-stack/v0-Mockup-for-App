# Sources for the landing page

Every number on the landing page is either from a source below or produced by this app's own planner (and labelled "Simulated"). Unverified numbers are left as `[STAT NEEDED: ...]` gaps.

## Used

1. **Jana A., Sarkar A., Parmar V., Saunik S. (2023). "Examining district-level disparity and determinants of timeliness of emergency medical services in Maharashtra, India." *Scientific Reports* 13:21239.** https://doi.org/10.1038/s41598-023-48713-1 (open access: https://pmc.ncbi.nlm.nih.gov/articles/PMC10692338/)
   - Data: Maharashtra Emergency Medical Services (108) call records, November 2022, 16,197 emergency trips across 36 districts.
   - Used: average time from the ambulance base to the patient (t2) **23.15 min** for emergency trips; average time from the patient to the hospital (t4) **39.41 min**.
   - Used: the National Health Mission benchmark the paper cites, an ambulance reaching the patient **within 20 min in urban areas** (30 min rural) after the call.
   - Not used: the paper's "average response time T = 134.5 min". Its components (t1 to t5) add up to 89.06 min, so the definition is ambiguous.

## Looked at, not used (not verifiable or not primary)

- Asian Age (2018) quoting a 25-minute 108 response time in Mumbai: old and not traceable to data.
- Blog and operator claims of 15 to 30 minutes for Mumbai, 93 minutes for certain emergencies, and an "18 to 25 minutes NITI Aayog" figure: no primary source found.
- Ministry of Health evaluation for Meghalaya (urban 24 min, rural 40 min): primary, but small sample (10 of 48 ambulances) and not Mumbai.

## Gaps left on the page

- `[STAT NEEDED: average 108 ambulance response time in Mumbai, call to arrival, with year and source]`. The best candidates are MEMS / Maharashtra Department of Health records for the Mumbai City and Mumbai Suburban districts, or an RTI reply.

## Produced by the app (labelled "Simulated" on the page)

- Before and after response times per ward for one example hospital at Parel with 3 units at 18:00 (`frontend/lib/landing-impact.json`). It was generated with the backend planner (`_compute_plan`) on the project's simulated ward demand data. "Before" means all units waiting at the hospital.
