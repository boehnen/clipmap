export function formatNumber(n: number, decimals = 1): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(decimals)}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(decimals)}K`;
  }
  return n.toFixed(decimals);
}

export function formatDistance(km: number, useMetric = true): string {
  if (useMetric) {
    if (km < 1) return `${Math.round(km * 1000)} m`;
    return `${km.toFixed(1)} km`;
  }
  const miles = km * 0.621371;
  if (miles < 0.1) return `${Math.round(miles * 5280)} ft`;
  return `${miles.toFixed(1)} mi`;
}

export function formatArea(km2: number, useMetric = true): string {
  if (useMetric) {
    if (km2 < 1) return `${(km2 * 1_000_000).toFixed(0)} m²`;
    return `${km2.toFixed(1)} km²`;
  }
  const mi2 = km2 * 0.386102;
  return `${mi2.toFixed(1)} mi²`;
}

export function formatPopulation(pop: number): string {
  if (pop >= 1_000_000) {
    return `${(pop / 1_000_000).toFixed(1)}M`;
  }
  if (pop >= 1_000) {
    return `${(pop / 1_000).toFixed(0)}K`;
  }
  return pop.toString();
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
