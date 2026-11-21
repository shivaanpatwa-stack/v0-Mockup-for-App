/**
 * Everything the first-run onboarding says and points at lives here. To change the tour, edit these two arrays;
 * no component needs to change.
 */

export type VideoStep = {
  id: string
  title: string
  description: string
  /** Served from `public/`. Drop the recorded file at this path (see README.md in this folder). */
  src: string
  /** Optional still shown before the video loads. Ignored if the file doesn't exist. */
  poster?: string
}

export const VIDEO_STEPS: VideoStep[] = [
  {
    id: 'recalculate',
    title: 'Recalculate staging',
    description:
      'One click re-plans where every available ambulance should wait, using the predicted demand for the hour you pick. Review the proposed moves, then apply the plan or discard it.',
    src: '/onboarding/recalculate.mp4',
  },
  {
    id: 'what-if',
    title: 'Try a What if…',
    description:
      'Change the conditions, such as a monsoon evening, fewer units or a closed staging position, and see how the plan and response times would change before you commit to anything.',
    src: '/onboarding/what-if.mp4',
  },
]

export type Placement = 'top' | 'bottom' | 'left' | 'right'

export type TourStep = {
  id: string
  /** Value of the `data-tour` attribute on the element to highlight. */
  target: string
  title: string
  body: string
  /** Preferred side of the target for the tooltip; the overlay falls back to the others if it doesn't fit. */
  placement?: Placement[]
  /** Extra space around the highlighted element, in px. */
  padding?: number
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'nav',
    target: 'nav',
    title: 'Move between sections',
    body: 'Live map, Staging plan, Scenarios, Run history and Data & assumptions. The number keys 1 to 5 jump straight to each one.',
    placement: ['bottom', 'top'],
  },
  {
    id: 'live-map',
    target: 'live-map',
    title: 'The live map',
    body: 'Your hospital, each ambulance and where it should wait, over a heat map of predicted demand. Click a ward or a unit to see its details.',
  },
  {
    id: 'kpis',
    target: 'kpis',
    title: 'How the plan is doing',
    body: 'Average response time, how much demand is reachable within the target, wards covered and units in service, with the change since the last plan.',
    placement: ['bottom'],
  },
  {
    id: 'recalc',
    target: 'recalc',
    title: 'Recalculate staging',
    body: 'Press this (or R) to work out the best waiting position for each unit. Nothing changes for the crews until you apply the new plan.',
    placement: ['bottom', 'right'],
  },
  {
    id: 'what-if',
    target: 'what-if',
    title: 'What if…',
    body: 'Open the scenario drawer (W) to try different demand, road speed or fleet sizes. Hold Space to compare a scenario with the current plan.',
    placement: ['bottom', 'right'],
  },
  {
    id: 'layers',
    target: 'layers',
    title: 'Map layers',
    body: 'Turn the demand heat map, the response-time reach and the unit markers on or off to focus on what you need.',
    placement: ['left', 'bottom'],
  },
  {
    id: 'time',
    target: 'time',
    title: 'Time of day',
    body: 'Scrub through the day, or press play, to see how predicted demand shifts hour by hour. The arrow keys move one hour at a time.',
    placement: ['top'],
  },
  {
    id: 'moves',
    target: 'moves',
    title: 'Moves',
    body: 'The list of units that need to relocate under the current plan. Dispatch them all at once, or cancel the live plan.',
    placement: ['left', 'top'],
  },
  {
    id: 'search',
    target: 'search',
    title: 'Search anything',
    body: 'Press Ctrl K (or ⌘K) to jump to a ward, a unit or a page. Press ? at any time to see every keyboard shortcut.',
    placement: ['bottom', 'left'],
  },
  {
    id: 'hospital-menu',
    target: 'hospital-menu',
    title: 'Your hospital',
    body: 'Find your hospital code for drivers, manage keys and sign out here. You can replay this tour any time from this menu.',
    placement: ['bottom', 'left'],
  },
]

export const COMPLETION = {
  title: "You're all set",
  body: 'That covers the essentials. Recalculate staging to place your units, then try a What if… to see how a different day would play out.',
  hint: 'Replay this tour any time from the hospital menu or the command palette.',
  action: 'Get Started',
}
