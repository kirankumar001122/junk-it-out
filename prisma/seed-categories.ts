import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding waste categories into database...');

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
      type: 'WASTE_CHARGE',
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
    const result = await prisma.wasteCategory.upsert({
      where: { name: cat.name },
      update: {
        description: cat.description,
        icon: cat.icon,
        type: cat.type,
        pricePerKg: cat.pricePerKg,
      },
      create: {
        name: cat.name,
        description: cat.description,
        icon: cat.icon,
        type: cat.type,
        pricePerKg: cat.pricePerKg,
      },
    });
    console.log(`Upserted category: ${result.name} (₹${result.pricePerKg}/kg)`);
  }

  console.log('Waste categories successfully seeded!');
}

main()
  .catch((e) => {
    console.error('Error seeding waste categories:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
