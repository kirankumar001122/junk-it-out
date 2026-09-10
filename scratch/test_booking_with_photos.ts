import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testBookingWithPhotos() {
  console.log('=== TESTING BOOKING CREATION WITH REAL WASTE PHOTOS ===\n');

  const categories = await prisma.wasteCategory.findMany();
  if (categories.length < 2) {
    console.error('Not enough categories found in DB.');
    return;
  }

  const photoUrls = [
    '/uploads/waste-photo-1788852069856-7r1sg.jpg',
    '/uploads/waste-photo-1788852069964-sojvh.png'
  ];

  const payload = {
    phone: '+919189745120',
    name: 'Kiran Kumar',
    address: {
      label: 'Home',
      houseNo: 'Flat 204, Royal Palms',
      building: 'Tower B',
      street: '15th Cross, Main Road',
      area: 'Whitefield, ITPL & Kadugodi',
      landmark: 'Near ITPL Gate',
      pincode: '560066',
      lat: 12.9698,
      lng: 77.7500,
    },
    items: [
      { categoryId: categories[0].id, estimatedWeight: 10 },
      { categoryId: categories[1].id, estimatedWeight: 8 }
    ],
    pickupType: 'ASAP',
    couponCode: 'WELCOME50',
    photos: photoUrls,
    notes: 'Please ring bell upon arrival.'
  };

  const res = await fetch('http://localhost:3000/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': `test-photos-${Date.now()}`
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  console.log('Order Creation Response Status:', res.status);
  console.log('Order ID:', data.data?.id);
  console.log('Order Number:', data.data?.orderNumber);

  if (!data.success) {
    console.error('Order creation failed:', data);
    return;
  }

  // Verify in Database
  const dbOrder = await prisma.order.findUnique({
    where: { id: data.data.id }
  });

  console.log('\nDatabase Verification for Order #' + dbOrder?.orderNumber + ':');
  console.log('  Raw wastePhotos in DB:', dbOrder?.wastePhotos);
  const parsed = JSON.parse(dbOrder?.wastePhotos || '[]');
  console.log('  Parsed wastePhotos Array:', parsed);
  console.log('  Photos count:', parsed.length);

  if (parsed.length === 2 && parsed[0] === photoUrls[0] && parsed[1] === photoUrls[1]) {
    console.log('\n✓ SUCCESS: Waste photos were stored, associated with order, and verified in database!');
  } else {
    console.error('\n✕ FAILURE: Photos were not stored correctly in database.');
  }

  await prisma.$disconnect();
}

testBookingWithPhotos().catch(console.error);
