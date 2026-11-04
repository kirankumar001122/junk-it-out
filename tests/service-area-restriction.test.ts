import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import {
  validateServiceArea,
  ServiceAreaUnavailableError,
  SERVICE_AREA_UNAVAILABLE_CODE,
  SERVICE_AREA_UNAVAILABLE_MESSAGE,
  APPROVED_SERVICE_ZONES,
  containsUnsupportedLocality,
} from '../lib/serviceArea';
import { checkGeofenceServiceability } from '../lib/services/serviceAreaService';
import { POST as checkServiceAreaPost } from '../app/api/service-areas/check/route';
import { POST as customerAddressesPost } from '../app/api/customer/addresses/route';
import { POST as ordersPost } from '../app/api/orders/route';
import { signToken } from '../lib/auth/jwt';
import { db } from '../lib/db';

async function runServiceAreaRestrictionTests() {
  console.log('--- RUNNING COMPREHENSIVE SERVICE AREA RESTRICTION TEST SUITE ---');

  // =========================================================================
  // 1. UNIT TESTS: Centralized Serviceability Validator
  // =========================================================================
  console.log('\n[1/7] Testing Centralized Serviceability Validator Unit Logic...');

  // 1.1 Valid Supported Areas: BTM Layout
  {
    const resBtm = validateServiceArea({
      lat: 12.9166,
      lng: 77.6101,
      area: 'BTM Layout',
      street: 'Outer Ring Road',
      pincode: '560068',
    });
    assert.equal(resBtm.serviceable, true, 'BTM Layout coordinates & area must be serviceable');
    assert.equal(resBtm.zone?.id, 'btm-layout');
    assert.match(resBtm.message, /BTM Layout/);
  }

  {
    const resBtm2 = validateServiceArea({
      lat: 12.9150,
      lng: 77.6080,
      area: 'BTM Layout 2nd Stage, Bengaluru',
    });
    assert.equal(resBtm2.serviceable, true, 'BTM Layout 2nd Stage must be serviceable');
    assert.equal(resBtm2.zone?.id, 'btm-layout');
  }

  // 1.2 Valid Supported Areas: JP Nagar
  {
    const resJp = validateServiceArea({
      lat: 12.9077,
      lng: 77.5854,
      area: 'JP Nagar',
      street: '15th Cross',
      pincode: '560078',
    });
    assert.equal(resJp.serviceable, true, 'JP Nagar coordinates & area must be serviceable');
    assert.equal(resJp.zone?.id, 'jp-nagar');
    assert.match(resJp.message, /JP Nagar/);
  }

  {
    const resJp7 = validateServiceArea({
      lat: 12.8980,
      lng: 77.5820,
      area: 'JP Nagar 7th Phase, Bengaluru',
    });
    assert.equal(resJp7.serviceable, true, 'JP Nagar 7th Phase must be serviceable');
    assert.equal(resJp7.zone?.id, 'jp-nagar');
  }

  // 1.3 Unsupported Areas: Whitefield
  {
    const resWhitefield = validateServiceArea({
      lat: 12.9698,
      lng: 77.7500,
      area: 'Whitefield, Bengaluru',
      street: 'ITPL Main Road',
      pincode: '560066',
    });
    assert.equal(resWhitefield.serviceable, false, 'Whitefield must be rejected');
    assert.equal(resWhitefield.error, SERVICE_AREA_UNAVAILABLE_CODE);
    assert.equal(resWhitefield.message, SERVICE_AREA_UNAVAILABLE_MESSAGE);
  }

  // 1.4 Unsupported Areas: Koramangala
  {
    const resKoramangala = validateServiceArea({
      lat: 12.9352,
      lng: 77.6245,
      area: 'Koramangala, Bengaluru',
      street: '80 Feet Road',
      pincode: '560034',
    });
    assert.equal(resKoramangala.serviceable, false, 'Koramangala must be rejected');
    assert.equal(resKoramangala.error, SERVICE_AREA_UNAVAILABLE_CODE);
    assert.equal(resKoramangala.message, SERVICE_AREA_UNAVAILABLE_MESSAGE);
  }

  // 1.5 Unsupported Areas: HSR Layout
  {
    const resHsr = validateServiceArea({
      lat: 12.9121,
      lng: 77.6446,
      area: 'HSR Layout, Bengaluru',
      street: '27th Main Road',
      pincode: '560102',
    });
    assert.equal(resHsr.serviceable, false, 'HSR Layout must be rejected');
    assert.equal(resHsr.error, SERVICE_AREA_UNAVAILABLE_CODE);
    assert.equal(resHsr.message, SERVICE_AREA_UNAVAILABLE_MESSAGE);
  }

  // 1.6 Unsupported Areas: Electronic City
  {
    const resEcity = validateServiceArea({
      lat: 12.8452,
      lng: 77.6602,
      area: 'Electronic City, Bengaluru',
      pincode: '560100',
    });
    assert.equal(resEcity.serviceable, false, 'Electronic City must be rejected');
    assert.equal(resEcity.error, SERVICE_AREA_UNAVAILABLE_CODE);
    assert.equal(resEcity.message, SERVICE_AREA_UNAVAILABLE_MESSAGE);
  }

  // 1.7 Unsupported Areas: Marathahalli
  {
    const resMarathahalli = validateServiceArea({
      lat: 12.9550,
      lng: 77.7000,
      area: 'Marathahalli, Bengaluru',
      pincode: '560037',
    });
    assert.equal(resMarathahalli.serviceable, false, 'Marathahalli must be rejected');
    assert.equal(resMarathahalli.error, SERVICE_AREA_UNAVAILABLE_CODE);
    assert.equal(resMarathahalli.message, SERVICE_AREA_UNAVAILABLE_MESSAGE);
  }

  // 1.8 Unknown Localities and Non-Bengaluru Cities
  {
    const resHebbal = validateServiceArea({
      lat: 13.0358,
      lng: 77.5970,
      area: 'Hebbal, Bengaluru',
    });
    assert.equal(resHebbal.serviceable, false, 'Hebbal must be rejected');

    const resYelahanka = validateServiceArea({
      lat: 13.1007,
      lng: 77.5963,
      area: 'Yelahanka, Bengaluru',
    });
    assert.equal(resYelahanka.serviceable, false, 'Yelahanka must be rejected');

    const resMumbai = validateServiceArea({
      area: 'Andheri West, Mumbai',
    });
    assert.equal(resMumbai.serviceable, false, 'Mumbai must be rejected');

    const resDelhi = validateServiceArea({
      area: 'Connaught Place, New Delhi',
    });
    assert.equal(resDelhi.serviceable, false, 'Delhi must be rejected');
  }

  // 1.9 Empty or Missing Locations
  {
    const resEmpty = validateServiceArea({});
    assert.equal(resEmpty.serviceable, false, 'Empty location must be rejected');
    assert.equal(resEmpty.error, SERVICE_AREA_UNAVAILABLE_CODE);
    assert.equal(resEmpty.message, SERVICE_AREA_UNAVAILABLE_MESSAGE);

    const resZeroCoords = validateServiceArea({ lat: 0, lng: 0, area: '' });
    assert.equal(resZeroCoords.serviceable, false, 'Zero coords with empty area must be rejected');
  }

  // 1.10 Misleading or Conflicting Locality Names
  {
    const resMisleading = validateServiceArea({
      area: 'Whitefield near BTM Layout',
      lat: 12.9698,
      lng: 77.7500,
    });
    assert.equal(resMisleading.serviceable, false, 'Whitefield near BTM Layout must be rejected');

    const resMisleading2 = validateServiceArea({
      area: 'BTM Layout Extension in Koramangala',
      lat: 12.9352,
      lng: 77.6245,
    });
    assert.equal(resMisleading2.serviceable, false, 'BTM Layout Extension in Koramangala must be rejected');
  }

  console.log('? Centralized Serviceability Validator unit logic passed.');

  // =========================================================================
  // 2. SERVICE LAYER: checkGeofenceServiceability
  // =========================================================================
  console.log('\n[2/7] Testing checkGeofenceServiceability Service Layer...');

  // 2.1 BTM Layout
  const geoBtm = await checkGeofenceServiceability(12.9166, 77.6101, 'BTM Layout');
  assert.equal(geoBtm.serviceable, true, 'BTM Layout must be serviceable');
  assert.equal(geoBtm.zone?.id, 'btm-layout');

  // 2.2 JP Nagar
  const geoJp = await checkGeofenceServiceability(12.9077, 77.5854, 'JP Nagar');
  assert.equal(geoJp.serviceable, true, 'JP Nagar must be serviceable');
  assert.equal(geoJp.zone?.id, 'jp-nagar');

  // 2.3 Whitefield
  const geoWhitefield = await checkGeofenceServiceability(12.9698, 77.7500, 'Whitefield');
  assert.equal(geoWhitefield.serviceable, false, 'Whitefield must not be serviceable');
  assert.equal(geoWhitefield.message, SERVICE_AREA_UNAVAILABLE_MESSAGE);

  // 2.4 Koramangala
  const geoKoramangala = await checkGeofenceServiceability(12.9352, 77.6245, 'Koramangala');
  assert.equal(geoKoramangala.serviceable, false, 'Koramangala must not be serviceable');
  assert.equal(geoKoramangala.message, SERVICE_AREA_UNAVAILABLE_MESSAGE);

  // 2.5 HSR Layout
  const geoHsr = await checkGeofenceServiceability(12.9121, 77.6446, 'HSR Layout');
  assert.equal(geoHsr.serviceable, false, 'HSR Layout must not be serviceable');
  assert.equal(geoHsr.message, SERVICE_AREA_UNAVAILABLE_MESSAGE);

  // 2.6 Electronic City & Marathahalli
  const geoEcity = await checkGeofenceServiceability(12.8452, 77.6602, 'Electronic City');
  assert.equal(geoEcity.serviceable, false);
  assert.equal(geoEcity.message, SERVICE_AREA_UNAVAILABLE_MESSAGE);

  const geoMarathahalli = await checkGeofenceServiceability(12.9550, 77.7000, 'Marathahalli');
  assert.equal(geoMarathahalli.serviceable, false);
  assert.equal(geoMarathahalli.message, SERVICE_AREA_UNAVAILABLE_MESSAGE);

  console.log('? checkGeofenceServiceability service layer correctly rejects unsupported areas.');

  // =========================================================================
  // 3. API ROUTE: POST /api/service-areas/check
  // =========================================================================
  console.log('\n[3/7] Testing POST /api/service-areas/check API Handler...');

  // 3.1 BTM Layout
  {
    const reqCheckBtm = new NextRequest('http://localhost/api/service-areas/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: 12.9166, lng: 77.6101 }),
    });
    const resCheckBtm = await checkServiceAreaPost(reqCheckBtm);
    assert.equal(resCheckBtm.status, 200);
    const bodyCheckBtm = await resCheckBtm.json();
    assert.equal(bodyCheckBtm.success, true);
    assert.equal(bodyCheckBtm.data.serviceable, true);
    assert.equal(bodyCheckBtm.data.zone?.id, 'btm-layout');
  }

  // 3.2 JP Nagar
  {
    const reqCheckJp = new NextRequest('http://localhost/api/service-areas/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: 12.9077, lng: 77.5854 }),
    });
    const resCheckJp = await checkServiceAreaPost(reqCheckJp);
    assert.equal(resCheckJp.status, 200);
    const bodyCheckJp = await resCheckJp.json();
    assert.equal(bodyCheckJp.success, true);
    assert.equal(bodyCheckJp.data.serviceable, true);
    assert.equal(bodyCheckJp.data.zone?.id, 'jp-nagar');
  }

  // 3.3 Whitefield (returns 200 with serviceable: false and customer message)
  {
    const reqCheckWhitefield = new NextRequest('http://localhost/api/service-areas/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: 12.9698, lng: 77.7500, areaName: 'Whitefield' }),
    });
    const resCheckWhitefield = await checkServiceAreaPost(reqCheckWhitefield);
    assert.equal(resCheckWhitefield.status, 200);
    const bodyCheckWhitefield = await resCheckWhitefield.json();
    assert.equal(bodyCheckWhitefield.success, true);
    assert.equal(bodyCheckWhitefield.data.serviceable, false);
    assert.equal(bodyCheckWhitefield.data.message, SERVICE_AREA_UNAVAILABLE_MESSAGE);
  }

  // 3.4 Invalid Coordinates (returns 400)
  {
    const reqCheckInvalid = new NextRequest('http://localhost/api/service-areas/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: 'invalid', lng: 'coordinates' }),
    });
    const resCheckInvalid = await checkServiceAreaPost(reqCheckInvalid);
    assert.equal(resCheckInvalid.status, 400);
  }

  console.log('? POST /api/service-areas/check API handler passed.');

  // =========================================================================
  // 4. API ROUTE: POST /api/customer/addresses Validation
  // =========================================================================
  console.log('\n[4/7] Testing Address Creation (POST /api/customer/addresses) Service Area Guard...');

  const customerToken = signToken({
    userId: 'user-service-test-1',
    customerId: 'cust-service-1',
    role: 'CUSTOMER',
    phone: '+919988776655',
    tokenVersion: 1,
  });

  const origFindUnique = db.user.findUnique;
  (db.user as any).findUnique = async () => ({
    id: 'user-service-test-1',
    phone: '+919988776655',
    name: 'Service Test Customer',
  });

  const origTx = db.$transaction;
  (db as any).$transaction = async (fn: any) =>
    fn({
      address: {
        updateMany: async () => ({ count: 1 }),
        create: async (args: any) => ({ id: 'addr-created-1', ...args.data }),
      },
    });

  try {
    // 4.1 Allow saving address in BTM Layout
    const reqSaveBtm = new NextRequest('http://localhost/api/customer/addresses', {
      method: 'POST',
      headers: {
        Cookie: `jio_token=${customerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        label: 'Home',
        houseNo: '101',
        street: '7th Main',
        area: 'BTM Layout',
        pincode: '560068',
        lat: 12.9166,
        lng: 77.6101,
      }),
    });
    const resSaveBtm = await customerAddressesPost(reqSaveBtm);
    assert.equal(resSaveBtm.status, 200, 'Saving address in BTM Layout must succeed');
    const bodySaveBtm = await resSaveBtm.json();
    assert.equal(bodySaveBtm.success, true);

    // 4.2 Allow saving address in JP Nagar
    const reqSaveJp = new NextRequest('http://localhost/api/customer/addresses', {
      method: 'POST',
      headers: {
        Cookie: `jio_token=${customerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        label: 'Home',
        houseNo: '202',
        street: '15th Cross',
        area: 'JP Nagar',
        pincode: '560078',
        lat: 12.9077,
        lng: 77.5854,
      }),
    });
    const resSaveJp = await customerAddressesPost(reqSaveJp);
    assert.equal(resSaveJp.status, 200, 'Saving address in JP Nagar must succeed');
    const bodySaveJp = await resSaveJp.json();
    assert.equal(bodySaveJp.success, true);

    // 4.3 Reject saving address in Whitefield
    const reqSaveWhitefield = new NextRequest('http://localhost/api/customer/addresses', {
      method: 'POST',
      headers: {
        Cookie: `jio_token=${customerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        label: 'Office',
        houseNo: '102',
        street: 'ECC Road',
        area: 'Whitefield',
        pincode: '560066',
        lat: 12.9698,
        lng: 77.7500,
      }),
    });
    const resSaveWhitefield = await customerAddressesPost(reqSaveWhitefield);
    assert.equal(resSaveWhitefield.status, 400);
    const bodySaveWhitefield = await resSaveWhitefield.json();
    assert.equal(bodySaveWhitefield.success, false);
    assert.equal(bodySaveWhitefield.code, SERVICE_AREA_UNAVAILABLE_CODE);
    assert.equal(bodySaveWhitefield.message, SERVICE_AREA_UNAVAILABLE_MESSAGE);

    // 4.4 Reject saving address in Koramangala
    const reqSaveKoramangala = new NextRequest('http://localhost/api/customer/addresses', {
      method: 'POST',
      headers: {
        Cookie: `jio_token=${customerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        label: 'Work',
        houseNo: '202',
        street: '80ft Road',
        area: 'Koramangala',
        pincode: '560034',
        lat: 12.9352,
        lng: 77.6245,
      }),
    });
    const resSaveKoramangala = await customerAddressesPost(reqSaveKoramangala);
    assert.equal(resSaveKoramangala.status, 400);
    const bodySaveKoramangala = await resSaveKoramangala.json();
    assert.equal(bodySaveKoramangala.code, SERVICE_AREA_UNAVAILABLE_CODE);
    assert.equal(bodySaveKoramangala.message, SERVICE_AREA_UNAVAILABLE_MESSAGE);

    // 4.5 Reject saving address in HSR Layout
    const reqSaveHsr = new NextRequest('http://localhost/api/customer/addresses', {
      method: 'POST',
      headers: {
        Cookie: `jio_token=${customerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        label: 'Work',
        houseNo: '303',
        street: '27th Main',
        area: 'HSR Layout',
        pincode: '560102',
        lat: 12.9121,
        lng: 77.6446,
      }),
    });
    const resSaveHsr = await customerAddressesPost(reqSaveHsr);
    assert.equal(resSaveHsr.status, 400);

    // 4.6 Reject saving address in Electronic City
    const reqSaveEcity = new NextRequest('http://localhost/api/customer/addresses', {
      method: 'POST',
      headers: {
        Cookie: `jio_token=${customerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        label: 'Office',
        houseNo: '404',
        street: 'Phase 1',
        area: 'Electronic City',
        pincode: '560100',
        lat: 12.8452,
        lng: 77.6602,
      }),
    });
    const resSaveEcity = await customerAddressesPost(reqSaveEcity);
    assert.equal(resSaveEcity.status, 400);

    // 4.7 Reject saving address in Marathahalli
    const reqSaveMarathahalli = new NextRequest('http://localhost/api/customer/addresses', {
      method: 'POST',
      headers: {
        Cookie: `jio_token=${customerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        label: 'Home',
        houseNo: '505',
        street: 'Outer Ring Road',
        area: 'Marathahalli',
        pincode: '560037',
        lat: 12.9550,
        lng: 77.7000,
      }),
    });
    const resSaveMarathahalli = await customerAddressesPost(reqSaveMarathahalli);
    assert.equal(resSaveMarathahalli.status, 400);
  } finally {
    (db.user as any).findUnique = origFindUnique;
    (db as any).$transaction = origTx;
  }

  console.log('? POST /api/customer/addresses strictly blocks unsupported address creation.');

  // =========================================================================
  // 5. API ROUTE: POST /api/orders Backend Enforcement
  // =========================================================================
  console.log('\n[5/7] Testing Direct Order Creation (POST /api/orders) Backend Enforcement...');

  const origFindUniqueOrders = db.user.findUnique;
  const origAddressCreate = db.address.create;
  (db.address as any).create = async (args: any) => ({ id: 'addr-test-1', ...args.data });
  (db.user as any).findUnique = async () => ({
    id: 'user-service-test-1',
    tokenVersion: 1,
    role: 'CUSTOMER',
    name: 'Service Test Customer',
    phone: '+919988776655',
    customer: { id: 'cust-service-1' },
    addresses: [],
  });

  try {
    // 5.1 Direct API call with Whitefield address must return HTTP 400 with SERVICE_AREA_UNAVAILABLE
    {
      const reqOrderWhitefield = new NextRequest('http://localhost/api/orders', {
        method: 'POST',
        headers: {
          Cookie: `jio_token=${customerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Service Test Customer',
          phone: '+919988776655',
          address: {
            houseNo: 'Flat 401',
            street: 'ECC Road',
            area: 'Whitefield',
            pincode: '560066',
            lat: 12.9698,
            lng: 77.7500,
          },
          items: [{ categoryId: 'cat-1', estimatedWeight: 10 }],
          pickupType: 'ASAP',
        }),
      });

      const resOrderWhitefield = await ordersPost(reqOrderWhitefield);
      assert.equal(resOrderWhitefield.status, 400, 'Direct order creation for Whitefield must return 400');
      const bodyOrderWhitefield = await resOrderWhitefield.json();
      assert.equal(bodyOrderWhitefield.success, false);
      assert.equal(bodyOrderWhitefield.error?.code, SERVICE_AREA_UNAVAILABLE_CODE);
      assert.equal(bodyOrderWhitefield.error?.message, SERVICE_AREA_UNAVAILABLE_MESSAGE);
    }

    // 5.2 Direct API call with Koramangala address must return HTTP 400 with SERVICE_AREA_UNAVAILABLE
    {
      const reqOrderKoramangala = new NextRequest('http://localhost/api/orders', {
        method: 'POST',
        headers: {
          Cookie: `jio_token=${customerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Service Test Customer',
          phone: '+919988776655',
          address: {
            houseNo: 'House 12',
            street: '1st Block',
            area: 'Koramangala',
            pincode: '560034',
            lat: 12.9352,
            lng: 77.6245,
          },
          items: [{ categoryId: 'cat-1', estimatedWeight: 5 }],
          pickupType: 'ASAP',
        }),
      });

      const resOrderKoramangala = await ordersPost(reqOrderKoramangala);
      assert.equal(resOrderKoramangala.status, 400, 'Direct order creation for Koramangala must return 400');
      const bodyOrderKoramangala = await resOrderKoramangala.json();
      assert.equal(bodyOrderKoramangala.success, false);
      assert.equal(bodyOrderKoramangala.error?.code, SERVICE_AREA_UNAVAILABLE_CODE);
      assert.equal(bodyOrderKoramangala.error?.message, SERVICE_AREA_UNAVAILABLE_MESSAGE);
    }

    // 5.3 Direct API call with HSR Layout address must return HTTP 400 with SERVICE_AREA_UNAVAILABLE
    {
      const reqOrderHsr = new NextRequest('http://localhost/api/orders', {
        method: 'POST',
        headers: {
          Cookie: `jio_token=${customerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Service Test Customer',
          phone: '+919988776655',
          address: {
            houseNo: 'House 34',
            street: 'Sector 2',
            area: 'HSR Layout',
            pincode: '560102',
            lat: 12.9121,
            lng: 77.6446,
          },
          items: [{ categoryId: 'cat-1', estimatedWeight: 5 }],
          pickupType: 'ASAP',
        }),
      });

      const resOrderHsr = await ordersPost(reqOrderHsr);
      assert.equal(resOrderHsr.status, 400, 'Direct order creation for HSR Layout must return 400');
      const bodyOrderHsr = await resOrderHsr.json();
      assert.equal(bodyOrderHsr.error?.code, SERVICE_AREA_UNAVAILABLE_CODE);
      assert.equal(bodyOrderHsr.error?.message, SERVICE_AREA_UNAVAILABLE_MESSAGE);
    }

    // 5.4 Direct API call with Electronic City must return HTTP 400
    {
      const reqOrderEcity = new NextRequest('http://localhost/api/orders', {
        method: 'POST',
        headers: {
          Cookie: `jio_token=${customerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Service Test Customer',
          phone: '+919988776655',
          address: {
            houseNo: 'Tower A',
            street: 'Electronic City Phase 1',
            area: 'Electronic City',
            pincode: '560100',
            lat: 12.8452,
            lng: 77.6602,
          },
          items: [{ categoryId: 'cat-1', estimatedWeight: 5 }],
          pickupType: 'ASAP',
        }),
      });

      const resOrderEcity = await ordersPost(reqOrderEcity);
      assert.equal(resOrderEcity.status, 400);
      const bodyOrderEcity = await resOrderEcity.json();
      assert.equal(bodyOrderEcity.error?.code, SERVICE_AREA_UNAVAILABLE_CODE);
    }

    // 5.5 Direct API call with Marathahalli must return HTTP 400
    {
      const reqOrderMarathahalli = new NextRequest('http://localhost/api/orders', {
        method: 'POST',
        headers: {
          Cookie: `jio_token=${customerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Service Test Customer',
          phone: '+919988776655',
          address: {
            houseNo: 'House 505',
            street: 'Bridge Road',
            area: 'Marathahalli',
            pincode: '560037',
            lat: 12.9550,
            lng: 77.7000,
          },
          items: [{ categoryId: 'cat-1', estimatedWeight: 5 }],
          pickupType: 'ASAP',
        }),
      });

      const resOrderMarathahalli = await ordersPost(reqOrderMarathahalli);
      assert.equal(resOrderMarathahalli.status, 400);
      const bodyOrderMarathahalli = await resOrderMarathahalli.json();
      assert.equal(bodyOrderMarathahalli.error?.code, SERVICE_AREA_UNAVAILABLE_CODE);
    }

    // 5.6 Direct API call with empty/missing address must return HTTP 400
    {
      const reqOrderMissing = new NextRequest('http://localhost/api/orders', {
        method: 'POST',
        headers: {
          Cookie: `jio_token=${customerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Service Test Customer',
          phone: '+919988776655',
          address: {},
          items: [{ categoryId: 'cat-1', estimatedWeight: 5 }],
          pickupType: 'ASAP',
        }),
      });

      const resOrderMissing = await ordersPost(reqOrderMissing);
      assert.equal(resOrderMissing.status, 400);
    }

    // 5.7 Direct API call with valid JP Nagar address passes service area validation
    {
      const reqOrderValidJp = new NextRequest('http://localhost/api/orders', {
        method: 'POST',
        headers: {
          Cookie: `jio_token=${customerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Service Test Customer',
          phone: '+919988776655',
          address: {
            houseNo: 'House 101',
            street: '15th Cross',
            area: 'JP Nagar',
            pincode: '560078',
            lat: 12.9077,
            lng: 77.5854,
          },
          items: [{ categoryId: 'non-existent-cat', estimatedWeight: 5 }],
          pickupType: 'ASAP',
        }),
      });

      const resOrderValidJp = await ordersPost(reqOrderValidJp);
      const bodyOrderValidJp = await resOrderValidJp.json();
      // It should NOT fail on service area validation!
      assert.notEqual(bodyOrderValidJp.error?.code, SERVICE_AREA_UNAVAILABLE_CODE);
    }

    // 5.8 Direct API call with valid BTM Layout address passes service area validation
    {
      const reqOrderValidBtm = new NextRequest('http://localhost/api/orders', {
        method: 'POST',
        headers: {
          Cookie: `jio_token=${customerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Service Test Customer',
          phone: '+919988776655',
          address: {
            houseNo: 'Flat 302',
            street: '7th Main Road',
            area: 'BTM Layout',
            pincode: '560068',
            lat: 12.9166,
            lng: 77.6101,
          },
          items: [{ categoryId: 'non-existent-cat', estimatedWeight: 5 }],
          pickupType: 'ASAP',
        }),
      });

      const resOrderValidBtm = await ordersPost(reqOrderValidBtm);
      const bodyOrderValidBtm = await resOrderValidBtm.json();
      // It should NOT fail on service area validation!
      assert.notEqual(bodyOrderValidBtm.error?.code, SERVICE_AREA_UNAVAILABLE_CODE);
    }

    console.log('? POST /api/orders strictly enforces SERVICE_AREA_UNAVAILABLE on rejected areas and allows JP/BTM.');
  } finally {
    (db.user as any).findUnique = origFindUniqueOrders;
    (db.address as any).create = origAddressCreate;
  }

  // =========================================================================
  // 6. SAVED ADDRESS RESTRICTION: Existing unsupported addresses blocked
  // =========================================================================
  console.log('\n[6/7] Testing Existing Unsupported Saved Addresses are Blocked from Booking...');

  const unsupportedSavedAddresses = [
    { houseNo: '12', street: 'ECC Road', area: 'Whitefield', lat: 12.9698, lng: 77.7500, pincode: '560066' },
    { houseNo: '34', street: '80ft Road', area: 'Koramangala', lat: 12.9352, lng: 77.6245, pincode: '560034' },
    { houseNo: '56', street: '27th Main', area: 'HSR Layout', lat: 12.9121, lng: 77.6446, pincode: '560102' },
    { houseNo: '78', street: 'Phase 1', area: 'Electronic City', lat: 12.8452, lng: 77.6602, pincode: '560100' },
    { houseNo: '90', street: 'Ring Road', area: 'Marathahalli', lat: 12.9550, lng: 77.7000, pincode: '560037' },
  ];

  for (const addr of unsupportedSavedAddresses) {
    const check = validateServiceArea(addr);
    assert.equal(check.serviceable, false, `Saved address in ${addr.area} must NOT be serviceable`);
    assert.equal(check.message, SERVICE_AREA_UNAVAILABLE_MESSAGE);
    assert.equal(check.error, SERVICE_AREA_UNAVAILABLE_CODE);
  }
  console.log('? Existing saved addresses in unsupported areas are strictly blocked.');

  // =========================================================================
  // 7. MODULE CONTRACT: lib/serviceArea.ts Re-export Integrity
  // =========================================================================
  console.log('\n[7/7] Testing lib/serviceArea.ts Module Contract...');

  assert.equal(typeof validateServiceArea, 'function');
  assert.equal(typeof ServiceAreaUnavailableError, 'function');
  assert.equal(SERVICE_AREA_UNAVAILABLE_CODE, 'SERVICE_AREA_UNAVAILABLE');
  assert.equal(
    SERVICE_AREA_UNAVAILABLE_MESSAGE,
    "Sorry! Our pickup service is currently available only in BTM Layout and JP Nagar, Bengaluru. We don't serve your location yet."
  );
  assert.equal(APPROVED_SERVICE_ZONES.length, 2);
  assert.deepEqual(
    APPROVED_SERVICE_ZONES.map((z) => z.id).sort(),
    ['btm-layout', 'jp-nagar']
  );
  console.log('? lib/serviceArea.ts re-export integrity verified.');

  console.log('\n===============================================================');
  console.log('? ALL SERVICE AREA RESTRICTION TESTS PASSED 100%!');
  console.log('===============================================================');
}

runServiceAreaRestrictionTests().catch((err) => {
  console.error('Service area restriction test failed:', err);
  process.exit(1);
});
