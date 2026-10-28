export const MAX_AGENT_POSITION_AGE_MS = 30_000;
const MAX_FUTURE_POSITION_SKEW_MS = 5_000;

export function getFreshAgentCoordinates(
  position: {
    coords: Pick<GeolocationCoordinates, 'latitude' | 'longitude'>;
    timestamp: number;
  },
  now = Date.now(),
) {
  const { latitude, longitude } = position.coords;
  const age = now - position.timestamp;
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    !Number.isFinite(position.timestamp) ||
    age > MAX_AGENT_POSITION_AGE_MS ||
    age < -MAX_FUTURE_POSITION_SKEW_MS
  ) {
    return null;
  }

  return { lat: latitude, lng: longitude };
}

export function getAgentGeolocationErrorMessage(code: number) {
  switch (code) {
    case 1:
      return 'Location permission was denied. Allow location access in your browser settings to share your route.';
    case 2:
      return 'Your device could not determine a location. Check location services and try again.';
    case 3:
      return 'Location request timed out. Check your connection or location services and try again.';
    default:
      return 'Location sharing is unavailable. Check your device settings and try again.';
  }
}
