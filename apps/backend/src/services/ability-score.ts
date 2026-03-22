export function calculateModifier(stat: number): number {
  return Math.floor((stat - 10) / 2);
}
