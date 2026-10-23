/** A team's number, followed by its name when the hub has one ("254 The Cheesy Poofs"). */
export function teamLabel(team: number, names: Record<number, string> = {}): string {
  return names[team] ? `${team} ${names[team]}` : String(team);
}
