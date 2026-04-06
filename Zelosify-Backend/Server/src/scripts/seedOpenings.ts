import prisma from "../config/prisma/prisma.js";

/**
 * Seeds the database with sample job openings for testing purposes.
 */
async function seedOpenings() {
  try {
    console.log("🌱 Seeding openings data...");

    const tenants = await prisma.tenants.findMany({
      select: {
        tenantId: true,
      },
    });

    if (tenants.length === 0) {
      console.log("⚠️ No tenants found. Seed tenants before seeding openings.");
      return;
    }

    for (const tenant of tenants) {
      const openings = [
        {
          code: "ITV-001",
          title: "Senior React Developer",
          department: "Engineering",
          description:
            "Build reusable frontend modules and collaborate with cross-functional teams.",
          location: "Chennai",
          requiredSkills: ["React", "TypeScript", "Next.js"],
          experienceMinYears: 4,
          experienceMaxYears: 8,
          numberOfPositions: 2,
          status: "OPEN" as const,
        },
        {
          code: "ITV-002",
          title: "Backend Node.js Engineer",
          department: "Engineering",
          description:
            "Develop API services, optimize SQL queries, and maintain backend integrations.",
          location: "Bengaluru",
          requiredSkills: ["Node.js", "TypeScript", "PostgreSQL"],
          experienceMinYears: 3,
          experienceMaxYears: 7,
          numberOfPositions: 3,
          status: "OPEN" as const,
        },
      ];

      for (const opening of openings) {
        await prisma.opening.upsert({
          where: {
            tenantId_code: {
              tenantId: tenant.tenantId,
              code: opening.code,
            },
          },
          update: {
            title: opening.title,
            department: opening.department,
            description: opening.description,
            location: opening.location,
            requiredSkills: opening.requiredSkills,
            experienceMinYears: opening.experienceMinYears,
            experienceMaxYears: opening.experienceMaxYears,
            numberOfPositions: opening.numberOfPositions,
            status: opening.status,
          },
          create: {
            tenantId: tenant.tenantId,
            code: opening.code,
            title: opening.title,
            department: opening.department,
            description: opening.description,
            location: opening.location,
            requiredSkills: opening.requiredSkills,
            experienceMinYears: opening.experienceMinYears,
            experienceMaxYears: opening.experienceMaxYears,
            numberOfPositions: opening.numberOfPositions,
            status: opening.status,
          },
        });
      }
    }

    console.log("✅ Openings seeded successfully");
  } catch (error) {
    console.error("❌ Error seeding openings:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seed function
seedOpenings();
