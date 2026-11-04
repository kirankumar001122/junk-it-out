import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // ADD YOUR ADMIN HERE
  const adminUser = await prisma.user.upsert({
    where: { phone: "8610466283" },
    update: { 
      role: "ADMIN",
      isAdmin: true,
      name: "Admin - 8610466283"
    },
    create: {
      phone: "8610466283",
      name: "Admin - 8610466283",
      role: "ADMIN",
      isAdmin: true,
      isVerified: true,
    },
  })

  console.log("Admin seeded:", adminUser)

  // Keep existing categories seed if any...
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })