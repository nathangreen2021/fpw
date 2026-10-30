// Benchmark efforts tracked like Strava segments. unit "time" = lower is better.
export const PB_EVENTS = {
  run_1k:          { name: '1 km Run',                 unit: 'time', group: 'Running' },
  run_5k:          { name: '5 km Run',                 unit: 'time', group: 'Running' },
  ski_1000:        { name: 'SkiErg 1000 m',            unit: 'time', group: 'Stations' },
  sled_push_50:    { name: 'Sled Push 50 m',           unit: 'time', group: 'Stations' },
  sled_pull_50:    { name: 'Sled Pull 50 m',           unit: 'time', group: 'Stations' },
  bbj_80:          { name: 'Burpee Broad Jumps 80 m',  unit: 'time', group: 'Stations' },
  row_1000:        { name: 'Row 1000 m',               unit: 'time', group: 'Stations' },
  farmers_200:     { name: 'Farmers Carry 200 m',      unit: 'time', group: 'Stations' },
  lunges_100:      { name: 'Sandbag Lunges 100 m',     unit: 'time', group: 'Stations' },
  wall_balls_100:  { name: '100 Wall Balls',           unit: 'time', group: 'Stations' },
  half_sim:        { name: 'Half HYROX Simulation',    unit: 'time', group: 'Simulations' },
  full_sim:        { name: 'Full HYROX Simulation',    unit: 'time', group: 'Simulations' },
  back_squat_1rm:  { name: 'Back Squat 1RM',           unit: 'kg',   group: 'Strength' },
  deadlift_1rm:    { name: 'Deadlift 1RM',             unit: 'kg',   group: 'Strength' },
};

export const lowerIsBetter = (ev) => PB_EVENTS[ev]?.unit === 'time';
export const isBetter = (ev, a, b) => (lowerIsBetter(ev) ? a < b : a > b);

export function bestOf(results, ev) {
  return results
    .filter((r) => r.event === ev)
    .reduce((best, r) => (!best || isBetter(ev, r.value, best.value) ? r : best), null);
}
