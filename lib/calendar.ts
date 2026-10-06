// Malaysian context calendar for 2025–2027. Islamic and lunar dates are
// approximate (they depend on moon sighting); good enough for demand shaping.

type Range = { from: string; to: string; name: string };

const PUBLIC_HOLIDAYS: Record<string, string> = {
  "2025-08-31": "Merdeka Day",
  "2025-09-05": "Maulidur Rasul",
  "2025-09-16": "Malaysia Day",
  "2025-10-20": "Deepavali",
  "2025-12-25": "Christmas",
  "2026-01-01": "New Year",
  "2026-02-01": "Thaipusam",
  "2026-02-17": "Chinese New Year",
  "2026-02-18": "Chinese New Year",
  "2026-03-20": "Hari Raya Aidilfitri",
  "2026-03-21": "Hari Raya Aidilfitri",
  "2026-05-01": "Labour Day",
  "2026-05-27": "Hari Raya Haji",
  "2026-05-31": "Wesak Day",
  "2026-06-01": "Agong's Birthday",
  "2026-06-17": "Awal Muharram",
  "2026-08-25": "Maulidur Rasul",
  "2026-08-31": "Merdeka Day",
  "2026-09-16": "Malaysia Day",
  "2026-11-08": "Deepavali",
  "2026-12-25": "Christmas",
  "2027-01-01": "New Year",
  "2027-01-22": "Thaipusam",
  "2027-02-06": "Chinese New Year",
  "2027-02-07": "Chinese New Year",
  "2027-03-10": "Hari Raya Aidilfitri",
  "2027-03-11": "Hari Raya Aidilfitri",
  "2027-05-01": "Labour Day",
};

const RAMADAN: Range[] = [
  { from: "2026-02-18", to: "2026-03-19", name: "Ramadan" },
  { from: "2027-02-08", to: "2027-03-09", name: "Ramadan" },
];

const SCHOOL_HOLIDAYS: Range[] = [
  { from: "2025-12-20", to: "2026-01-11", name: "School holidays" },
  { from: "2026-05-23", to: "2026-06-07", name: "School holidays" },
  { from: "2026-08-29", to: "2026-09-06", name: "School holidays" },
  { from: "2026-12-05", to: "2027-01-03", name: "School holidays" },
];

// How demand at a typical kopitiam shifts on these days (1 = normal).
const MULTIPLIERS = { holiday: 0.75, ramadan: 0.8, school: 0.9 };

const inRange = (key: string, ranges: Range[]) =>
  ranges.find((r) => key >= r.from && key <= r.to);

export function demandMultiplier(key: string): number {
  let m = 1;
  if (PUBLIC_HOLIDAYS[key]) m *= MULTIPLIERS.holiday;
  if (inRange(key, RAMADAN)) m *= MULTIPLIERS.ramadan;
  if (inRange(key, SCHOOL_HOLIDAYS)) m *= MULTIPLIERS.school;
  return m;
}

export function contextLabels(key: string): string[] {
  const labels: string[] = [];
  if (PUBLIC_HOLIDAYS[key]) labels.push(PUBLIC_HOLIDAYS[key]);
  const ramadan = inRange(key, RAMADAN);
  if (ramadan) labels.push(ramadan.name);
  const school = inRange(key, SCHOOL_HOLIDAYS);
  if (school) labels.push(school.name);
  return labels;
}
