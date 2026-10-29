import assert from 'node:assert/strict';
import {
  getAgentGeolocationErrorMessage,
  getFreshAgentCoordinates,
} from '../lib/agentGeolocation';

const now = Date.parse('2026-10-28T05:30:00.000Z');
const freshPosition = {
  coords: { latitude: 12.9, longitude: 77.5 },
  timestamp: now - 1_000,
};

assert.deepEqual(getFreshAgentCoordinates(freshPosition, now), { lat: 12.9, lng: 77.5 });
assert.equal(getFreshAgentCoordinates({ ...freshPosition, timestamp: now - 31_000 }, now), null);
assert.equal(getFreshAgentCoordinates({ ...freshPosition, timestamp: now + 6_000 }, now), null);
assert.equal(getFreshAgentCoordinates({
  ...freshPosition,
  coords: { latitude: 91, longitude: 77.5 },
}, now), null);
assert.equal(getFreshAgentCoordinates({
  ...freshPosition,
  coords: { latitude: 12.9, longitude: Number.NaN },
}, now), null);
assert.match(getAgentGeolocationErrorMessage(1), /permission was denied/i);
assert.match(getAgentGeolocationErrorMessage(2), /could not determine/i);
assert.match(getAgentGeolocationErrorMessage(3), /timed out/i);
assert.match(getAgentGeolocationErrorMessage(0), /unavailable/i);

console.log('Agent browser geolocation validation scenarios passed.');
