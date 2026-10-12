import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildBookingAddressPayload, buildCustomerAddressPersistenceFields, formatPickupAddress, preserveConfirmedPickupAddress, resolvePickupAddressAfterPinMove } from '../../lib/address.ts';
import { getSelectedAddressSource } from '../../lib/selectedLocation.ts';
import { validateCreateOrderInput } from '../../lib/validations/schemas.ts';

const confirmedAddress = '#98, 6th A Cross, Naganathapura, Rayasandra, Doctor Layout, Bengaluru, 560100';
const coarseGeocode = 'Electronic City (Phase 1 & 2), 6th A Cross Road, Bengaluru, 560100';

test('a selected Places address remains canonical when reverse geocoding a moved pin', () => {
  assert.equal(preserveConfirmedPickupAddress(confirmedAddress, coarseGeocode), confirmedAddress);
  assert.equal(
    formatPickupAddress({
      formattedAddress: confirmedAddress,
      houseNo: '#98',
      street: '6th A Cross',
      area: 'Naganathapura',
      city: 'Bengaluru',
      pincode: '560100',
    }),
    confirmedAddress
  );
});

test('moving a pin keeps a confirmed Places address while explicit selection can replace it', () => {
  const moved = resolvePickupAddressAfterPinMove({
    address: confirmedAddress,
    addressSource: 'places',
    geocodedAddress: coarseGeocode,
    geocodeUseful: true,
  });
  assert.equal(moved.address, confirmedAddress);
  assert.equal(moved.keepConfirmedAddress, true);

  const newlySelected = resolvePickupAddressAfterPinMove({
    address: coarseGeocode,
    addressSource: 'places',
    geocodedAddress: confirmedAddress,
    geocodeUseful: true,
  });
  assert.equal(newlySelected.address, coarseGeocode);
});

test('failed pin reverse-geocoding keeps the saved display address but marks the new pin unverified', () => {
  const moved = resolvePickupAddressAfterPinMove({
    address: confirmedAddress,
    addressSource: 'saved',
    geocodeUseful: false,
  });
  assert.equal(moved.address, confirmedAddress);
  assert.equal(moved.addressVerified, false);
});

test('booking validation accepts the canonical address in the order payload', () => {
  const payload = {
    address: {
      formattedAddress: confirmedAddress,
      houseNo: '#98',
      street: '6th A Cross',
      area: 'Naganathapura',
      lat: 12.87,
      lng: 77.65,
    },
    items: [{ categoryId: 'test-category', estimatedWeight: 1 }],
  };

  assert.equal(validateCreateOrderInput(payload).valid, true);
  assert.equal(payload.address.formattedAddress, confirmedAddress);
});

test('booking does not require or synthesize a house, street, or postcode', () => {
  const payload = {
    address: { formattedAddress: 'South Bengaluru', area: 'Bengaluru', lat: 12.9, lng: 77.6 },
    items: [{ categoryId: 'test-category', estimatedWeight: 1 }],
  };
  assert.equal(validateCreateOrderInput(payload).valid, true);
  const booking = buildBookingAddressPayload({
    label: 'Home', houseNo: '', building: '', street: '', area: 'Bengaluru', fullAddress: 'South Bengaluru',
    landmark: '', pincode: '', lat: 12.9, lng: 77.6, placeId: null,
  });
  assert.equal(booking.houseNo, '');
  assert.equal(booking.street, '');
  assert.equal(booking.pincode, '');
  assert.equal(booking.formattedAddress, 'South Bengaluru');
  assert.equal(validateCreateOrderInput({ ...payload, address: { ...payload.address, formattedAddress: '' } }).valid, false);
});

test('customer address persistence carries the canonical address and real coordinates', () => {
  const fields = buildCustomerAddressPersistenceFields({
    formattedAddress: confirmedAddress,
    houseNo: '#98',
    building: '',
    street: '6th A Cross',
    area: 'Naganathapura',
    landmark: '',
    pincode: '560100',
    lat: 12.87,
    lng: 77.65,
    googlePlaceId: 'place-1',
  });
  assert.equal(fields.formattedAddress, confirmedAddress);
  assert.equal(fields.houseNo, '#98');
  assert.equal(fields.building, null);
  assert.equal(fields.street, '6th A Cross');
  assert.equal(fields.pincode, '560100');
  assert.equal(fields.lat, 12.87);
  assert.equal(fields.lng, 77.65);
});

test('saved address, My Pickups, tracking, and receipt share the canonical-first formatter', () => {
  const savedAddress = {
    formattedAddress: confirmedAddress,
    houseNo: '#98',
    street: '6th A Cross',
    area: 'Naganathapura',
    city: 'Bengaluru',
    pincode: '560100',
  };
  for (const display of ['saved address', 'My Pickups', 'tracking', 'receipt']) {
    assert.equal(formatPickupAddress(savedAddress), confirmedAddress, display);
  }
});

test('legacy order addresses still render from structured fields', () => {
  assert.equal(
    formatPickupAddress({
      formattedAddress: null,
      houseNo: '#98',
      street: '6th A Cross',
      area: 'Naganathapura',
      city: 'Bengaluru',
      pincode: '560100',
    }),
    '#98, 6th A Cross, Naganathapura, Bengaluru, 560100'
  );
});

test('legacy detailed selections are treated as confirmed during pin adjustment', () => {
  assert.equal(
    getSelectedAddressSource({ houseNo: '#98', street: '6th A Cross', pincode: '560100' }),
    'places'
  );
  assert.equal(getSelectedAddressSource({ address: 'Electronic City, Bengaluru' }), 'reverse-geocoded');
});
