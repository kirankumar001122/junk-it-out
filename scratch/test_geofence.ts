import { checkGeofenceServiceability } from '../lib/services/serviceAreaService';

async function testGeofence() {
  const testCases = [
    { name: "User's Test Coordinate (12.9509, 77.7076)", lat: 12.9509, lng: 77.7076 },
    { name: "South Bengaluru (JP Nagar)", lat: 12.9077, lng: 77.5854 },
    { name: "East Bengaluru (Whitefield)", lat: 12.9698, lng: 77.7500 },
    { name: "North Bengaluru (Yelahanka)", lat: 13.1007, lng: 77.5963 },
    { name: "West Bengaluru (Rajajinagar)", lat: 12.9982, lng: 77.5530 },
    { name: "Outside Bengaluru (Mysuru)", lat: 12.2958, lng: 76.6394 },
    { name: "Outside Bengaluru (Hosur)", lat: 12.7409, lng: 77.8253 },
  ];

  console.log('=== GEOFENCE SERVICEABILITY VERIFICATION RESULTS ===\n');

  for (const tc of testCases) {
    const result = await checkGeofenceServiceability(tc.lat, tc.lng);
    console.log(`Location: ${tc.name}`);
    console.log(`  GPS Coordinates: (${tc.lat}, ${tc.lng})`);
    console.log(`  Serviceable: ${result.serviceable}`);
    console.log(`  Matched Zone: ${result.zone ? result.zone.name : 'None (Outside Service Boundary)'}`);
    console.log(`  Message: ${result.message}`);
    console.log('----------------------------------------------------');
  }
}

testGeofence().catch(console.error);
