import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Junk It Out database...');

  // 1. Create Admin User (Darshan Tejomaya M - 8884176048)
  const adminUser = await prisma.user.upsert({
    where: { phone: '+918884176048' },
    update: { name: 'Darshan Tejomaya M', role: 'SUPER_ADMIN' },
    create: {
      phone: '+918884176048',
      email: 'darshan@junkitout.in',
      name: 'Darshan Tejomaya M',
      role: 'SUPER_ADMIN',
      admin: {
        create: {
          department: 'Operations & Management',
          accessLevel: 'SUPER_ADMIN',
        },
      },
    },
  });

  // 2. Create Official Field Agent User (9353276638)
  const agentUser1 = await prisma.user.upsert({
    where: { phone: '+919353276638' },
    update: { role: 'AGENT' },
    create: {
      phone: '+919353276638',
      email: 'agent@junkitout.in',
      name: 'Junk It Out Field Agent',
      role: 'AGENT',
      agent: {
        create: {
          vehicleType: 'Piaggio Ape Auto Loader (KA-05-JK-1024)',
          vehicleNumber: 'KA-05-JK-1024',
          status: 'AVAILABLE',
          currentLat: 12.9081,
          currentLng: 77.5901, // JP Nagar 7th Phase
          rating: 4.9,
          serviceAreas: 'JP Nagar, Jayanagar, Bannerghatta Road, Koramangala',
        },
      },
    },
    include: { agent: true },
  });

  // 3. Create Customer User
  const customerUser = await prisma.user.upsert({
    where: { email: 'kiran@example.com' },
    update: {},
    create: {
      phone: '+919189745120',
      email: 'kiran@example.com',
      name: 'Kiran Kumar',
      role: 'CUSTOMER',
      customer: {
        create: {
          referralCode: 'JIOKIRAN2026',
          points: 150,
        },
      },
      addresses: {
        create: {
          label: 'Home',
          name: 'Kiran Kumar',
          phone: '+919189745120',
          houseNo: 'Flat 204, Royal Palms Apartment',
          building: 'Royal Palms',
          street: '15th Cross, 24th Main Road',
          area: 'JP Nagar 7th Phase',
          landmark: 'Opposite Brigade Millenium',
          city: 'Bengaluru',
          pincode: '560078',
          lat: 12.8988,
          lng: 77.5855,
          pickupInstructions: 'Ring doorbell at gate. Call when outside.',
          isDefault: true,
        },
      },
    },
    include: { customer: true, addresses: true },
  });

  // 4. Create Bengaluru-Wide Service Areas with Boundary Polygons
  const serviceAreasData = [
    // SOUTH BENGALURU
    {
      name: 'JP Nagar (Phases 1 to 9)',
      etaMinutes: 20,
      basePickupCharge: 39.0,
      centerLat: 12.9077,
      centerLng: 77.5854,
      boundaryPolygon: JSON.stringify([
        [12.9200, 77.5750], [12.9200, 77.6000],
        [12.8850, 77.6000], [12.8850, 77.5750]
      ]),
    },
    {
      name: 'Jayanagar (Blocks 1 to 9)',
      etaMinutes: 20,
      basePickupCharge: 39.0,
      centerLat: 12.9250,
      centerLng: 77.5938,
      boundaryPolygon: JSON.stringify([
        [12.9400, 77.5780], [12.9400, 77.6050],
        [12.9150, 77.6050], [12.9150, 77.5780]
      ]),
    },
    {
      name: 'Electronic City (Phase 1 & 2)',
      etaMinutes: 25,
      basePickupCharge: 49.0,
      centerLat: 12.8452,
      centerLng: 77.6602,
      boundaryPolygon: JSON.stringify([
        [12.8650, 77.6400], [12.8650, 77.6850],
        [12.8200, 77.6850], [12.8200, 77.6400]
      ]),
    },
    {
      name: 'Koramangala (Blocks 1 to 8)',
      etaMinutes: 25,
      basePickupCharge: 49.0,
      centerLat: 12.9352,
      centerLng: 77.6245,
      boundaryPolygon: JSON.stringify([
        [12.9550, 77.6100], [12.9550, 77.6450],
        [12.9200, 77.6450], [12.9200, 77.6100]
      ]),
    },
    {
      name: 'HSR Layout (Sectors 1 to 7)',
      etaMinutes: 25,
      basePickupCharge: 49.0,
      centerLat: 12.9121,
      centerLng: 77.6446,
      boundaryPolygon: JSON.stringify([
        [12.9300, 77.6300], [12.9300, 77.6650],
        [12.8950, 77.6650], [12.8950, 77.6300]
      ]),
    },
    {
      name: 'BTM Layout (1st & 2nd Stage)',
      etaMinutes: 20,
      basePickupCharge: 39.0,
      centerLat: 12.9166,
      centerLng: 77.6101,
      boundaryPolygon: JSON.stringify([
        [12.9300, 77.5980], [12.9300, 77.6250],
        [12.9000, 77.6250], [12.9000, 77.5980]
      ]),
    },
    // NORTH BENGALURU
    {
      name: 'Yelahanka & Kogilu',
      etaMinutes: 25,
      basePickupCharge: 49.0,
      centerLat: 13.1007,
      centerLng: 77.5963,
      boundaryPolygon: JSON.stringify([
        [13.1500, 77.5600], [13.1500, 77.6300],
        [13.0700, 77.6300], [13.0700, 77.5600]
      ]),
    },
    {
      name: 'Hebbal, RT Nagar & Manyata',
      etaMinutes: 20,
      basePickupCharge: 39.0,
      centerLat: 13.0358,
      centerLng: 77.5970,
      boundaryPolygon: JSON.stringify([
        [13.0700, 77.5700], [13.0700, 77.6400],
        [13.0100, 77.6400], [13.0100, 77.5700]
      ]),
    },
    // EAST BENGALURU
    {
      name: 'Whitefield, ITPL & Kadugodi',
      etaMinutes: 25,
      basePickupCharge: 49.0,
      centerLat: 12.9698,
      centerLng: 77.7500,
      boundaryPolygon: JSON.stringify([
        [13.0100, 77.7000], [13.0100, 77.7800],
        [12.9300, 77.7800], [12.9300, 77.7000]
      ]),
    },
    {
      name: 'Indiranagar, Domlur & Marathahalli',
      etaMinutes: 20,
      basePickupCharge: 39.0,
      centerLat: 12.9784,
      centerLng: 77.6408,
      boundaryPolygon: JSON.stringify([
        [13.0000, 77.6200], [13.0000, 77.7000],
        [12.9400, 77.7000], [12.9400, 77.6200]
      ]),
    },
    // WEST BENGALURU
    {
      name: 'Rajajinagar & Malleshwaram',
      etaMinutes: 20,
      basePickupCharge: 39.0,
      centerLat: 12.9982,
      centerLng: 77.5530,
      boundaryPolygon: JSON.stringify([
        [13.0300, 77.5300], [13.0300, 77.5800],
        [12.9700, 77.5800], [12.9700, 77.5300]
      ]),
    },
    {
      name: 'Vijayanagar, Nagarbhavi & Kengeri',
      etaMinutes: 25,
      basePickupCharge: 49.0,
      centerLat: 12.9719,
      centerLng: 77.5300,
      boundaryPolygon: JSON.stringify([
        [13.0000, 77.4700], [13.0000, 77.5500],
        [12.8900, 77.5500], [12.8900, 77.4700]
      ]),
    },
    // CENTRAL BENGALURU
    {
      name: 'MG Road, Shivajinagar & Richmond Town',
      etaMinutes: 20,
      basePickupCharge: 39.0,
      centerLat: 12.9756,
      centerLng: 77.6066,
      boundaryPolygon: JSON.stringify([
        [13.0000, 77.5800], [13.0000, 77.6200],
        [12.9500, 77.6200], [12.9500, 77.5800]
      ]),
    },
  ];

  for (const area of serviceAreasData) {
    await prisma.serviceArea.upsert({
      where: { name: area.name },
      update: {},
      create: {
        name: area.name,
        city: 'Bengaluru',
        status: 'ACTIVE',
        etaMinutes: area.etaMinutes,
        basePickupCharge: area.basePickupCharge,
        boundaryPolygon: area.boundaryPolygon,
        centerLat: area.centerLat,
        centerLng: area.centerLng,
      },
    });
  }

  // 5. Create Waste Categories
  const categories = [
    {
      name: 'Plastic Waste',
      description: 'Bottles, containers, polythene, packaging materials, hard plastics',
      icon: 'Recycle',
      type: 'RECYCLABLE_BUY',
      pricePerKg: 18.0,
    },
    {
      name: 'Paper & Cardboard',
      description: 'Carton boxes, newspapers, magazines, office paper, shredded paper',
      icon: 'FileText',
      type: 'RECYCLABLE_BUY',
      pricePerKg: 14.0,
    },
    {
      name: 'Scrap Metal',
      description: 'Iron, steel, aluminium cans, copper wire, brass fittings, tin',
      icon: 'Hammer',
      type: 'RECYCLABLE_BUY',
      pricePerKg: 32.0,
    },
    {
      name: 'E-Waste',
      description: 'Keyboards, chargers, old phones, motherboards, small appliances',
      icon: 'Monitor',
      type: 'RECYCLABLE_BUY',
      pricePerKg: 45.0,
    },
    {
      name: 'Household Dry Waste',
      description: 'Clean dry packaging, fabric scraps, wooden pieces, rubber items',
      icon: 'Trash2',
      type: 'RECYCLABLE_BUY',
      pricePerKg: 8.0,
    },
    {
      name: 'Glass & Bottles',
      description: 'Intact glass bottles, glass jars, non-broken glass scrap',
      icon: 'Wine',
      type: 'RECYCLABLE_BUY',
      pricePerKg: 4.0,
    },
    {
      name: 'Old Furniture & Heavy Scrap',
      description: 'Chairs, tables, beds, metal frames, heavy bulky junk',
      icon: 'Armchair',
      type: 'WASTE_CHARGE', // Pickup service fee charged to customer
      pricePerKg: 15.0,
    },
    {
      name: 'Appliances (Fridge/AC/Washing Machine)',
      description: 'Refrigerators, AC units, washing machines, microwaves',
      icon: 'Tv',
      type: 'RECYCLABLE_BUY',
      pricePerKg: 25.0,
    },
  ];

  for (const cat of categories) {
    await prisma.wasteCategory.upsert({
      where: { name: cat.name },
      update: {},
      create: {
        name: cat.name,
        description: cat.description,
        icon: cat.icon,
        type: cat.type,
        pricePerKg: cat.pricePerKg,
      },
    });
  }

  // 6. Create Coupons
  await prisma.coupon.upsert({
    where: { code: 'WELCOME50' },
    update: {},
    create: {
      code: 'WELCOME50',
      discountType: 'FLAT',
      discountValue: 50.0,
      minOrderValue: 100.0,
      active: true,
    },
  });

  await prisma.coupon.upsert({
    where: { code: 'SOUTHBLR20' },
    update: {},
    create: {
      code: 'SOUTHBLR20',
      discountType: 'PERCENTAGE',
      discountValue: 20.0,
      minOrderValue: 200.0,
      maxDiscount: 100.0,
      active: true,
    },
  });

  // 7. Create Sample Active Order for Demonstration
  const plasticsCat = await prisma.wasteCategory.findUnique({ where: { name: 'Plastic Waste' } });
  const paperCat = await prisma.wasteCategory.findUnique({ where: { name: 'Paper & Cardboard' } });
  const address = customerUser.addresses[0];

  const order = await prisma.order.upsert({
    where: { orderNumber: 'JIO-20260907-000124' },
    update: {},
    create: {
      orderNumber: 'JIO-20260907-000124',
      customerId: customerUser.customer!.id,
      agentId: agentUser1.agent!.id,
      addressId: address.id,
      pickupType: 'ASAP',
      status: 'AGENT_ON_WAY',
      financialDirection: 'JUNKITOUT_PAYS',
      estimatedTotal: 280.0,
      actualTotal: 0.0,
      pickupCharge: 39.0,
      discountAmount: 0.0,
      finalAmount: 280.0,
      paymentStatus: 'PENDING',
      wastePhotos: JSON.stringify(['https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?q=80&w=600']),
      notes: 'Please call before arriving at gate.',
      items: {
        create: [
          {
            categoryId: plasticsCat!.id,
            estimatedWeight: 10.0,
            ratePerKg: 18.0,
            subtotal: 180.0,
          },
          {
            categoryId: paperCat!.id,
            estimatedWeight: 7.0,
            ratePerKg: 14.0,
            subtotal: 98.0,
          },
        ],
      },
      statusHistory: {
        create: [
          { oldStatus: null, newStatus: 'BOOKING_RECEIVED', notes: 'Order placed by customer' },
          { oldStatus: 'BOOKING_RECEIVED', newStatus: 'AGENT_ASSIGNED', notes: 'Assigned to Junk It Out Field Agent' },
          { oldStatus: 'AGENT_ASSIGNED', newStatus: 'AGENT_ON_WAY', notes: 'Agent started journey to JP Nagar 7th Phase' },
        ],
      },
      locations: {
        create: {
          agentId: agentUser1.agent!.id,
          lat: 12.9050,
          lng: 77.5880,
          speed: 24.5,
        },
      },
      notifications: {
        create: {
          userId: customerUser.id,
          type: 'WHATSAPP',
          recipient: customerUser.phone,
          content: 'Your Junk It Out pickup JIO-20260907-000124 is confirmed! Field Agent (Piaggio Auto KA-05-JK-1024) is on the way. ETA: 18 mins.',
          status: 'SENT',
        },
      },
    },
  });

  // 8. Add Audit Log
  await prisma.auditLog.create({
    data: {
      userId: adminUser.id,
      userName: adminUser.name,
      action: 'SYSTEM_INITIALIZED',
      oldValue: null,
      newValue: 'Seeded initial South Bengaluru service areas, categories, agents and sample order JIO-20260907-000124',
    },
  });

  console.log('Database successfully seeded with Junk It Out production data!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
