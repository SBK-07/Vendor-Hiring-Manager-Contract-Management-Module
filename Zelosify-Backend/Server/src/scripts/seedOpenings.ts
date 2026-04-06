import prisma from "../config/prisma/prisma.js";

/**
 * Seeds the database with sample job openings for testing purposes.
 */
async function seedOpenings() {
  try {
    console.log("🌱 Seeding openings data...");

    const tenant = await prisma.tenants.upsert({
      where: {
        tenantId: "bruce-wayne-corp-tenant",
      },
      update: {
        companyName: "Bruce Wayne Corp",
      },
      create: {
        tenantId: "bruce-wayne-corp-tenant",
        companyName: "Bruce Wayne Corp",
      },
      select: {
        tenantId: true,
      },
    });

    const openings = [
      {
        title: "Senior React Developer",
        description: "Build reusable frontend modules and lead component architecture.",
        location: "Chennai",
        contractType: "Contract",
        hiringManagerId: "Alfred Pennyworth",
        experienceMin: 4,
        experienceMax: 8,
        status: "OPEN" as const,
      },
      {
        title: "Backend Node.js Engineer",
        description: "Develop API services, optimize queries and build integrations.",
        location: "Bengaluru",
        contractType: "Contract",
        hiringManagerId: "Lucius Fox",
        experienceMin: 3,
        experienceMax: 7,
        status: "OPEN" as const,
      },
      {
        title: "QA Automation Engineer",
        description: "Design automation frameworks for web and API quality gates.",
        location: "Hyderabad",
        contractType: "Time & Material",
        hiringManagerId: "Barbara Gordon",
        experienceMin: 2,
        experienceMax: 5,
        status: "OPEN" as const,
      },
      {
        title: "DevOps Engineer",
        description: "Maintain CI/CD pipelines and cloud observability tooling.",
        location: "Pune",
        contractType: "Contract",
        hiringManagerId: "Lucius Fox",
        experienceMin: 4,
        experienceMax: 9,
        status: "OPEN" as const,
      },
      {
        title: "Data Analyst",
        description: "Build dashboards and perform trend analysis across hiring data.",
        location: "Mumbai",
        contractType: "Fixed Bid",
        hiringManagerId: "Harvey Bullock",
        experienceMin: 2,
        experienceMax: 6,
        status: "OPEN" as const,
      },
      {
        title: "Product Designer",
        description: "Create product-ready UI/UX systems and interaction patterns.",
        location: "Remote",
        contractType: "Contract",
        hiringManagerId: "Selina Kyle",
        experienceMin: 3,
        experienceMax: 7,
        status: "OPEN" as const,
      },
      {
        title: "Technical Project Manager",
        description: "Coordinate sprint delivery and stakeholder alignment.",
        location: "Chennai",
        contractType: "Retainer",
        hiringManagerId: "Jim Gordon",
        experienceMin: 6,
        experienceMax: 12,
        status: "OPEN" as const,
      },
      {
        title: "Cloud Security Engineer",
        description: "Implement IAM policies and secure cloud architecture patterns.",
        location: "Bengaluru",
        contractType: "Contract",
        hiringManagerId: "Kate Kane",
        experienceMin: 5,
        experienceMax: 10,
        status: "OPEN" as const,
      },
      {
        title: "Business Analyst",
        description: "Translate business requirements into technical stories.",
        location: "Delhi",
        contractType: "Time & Material",
        hiringManagerId: "Renee Montoya",
        experienceMin: 3,
        experienceMax: 7,
        status: "OPEN" as const,
      },
      {
        title: "Support Engineer",
        description: "Resolve production issues and maintain SLA compliance.",
        location: "Kolkata",
        contractType: "Contract",
        hiringManagerId: "Dick Grayson",
        experienceMin: 1,
        experienceMax: 4,
        status: "OPEN" as const,
      },
      {
        title: "Java Microservices Developer",
        description: "Build resilient microservices with Spring Boot.",
        location: "Hyderabad",
        contractType: "Fixed Bid",
        hiringManagerId: "Tim Drake",
        experienceMin: 4,
        experienceMax: 9,
        status: "OPEN" as const,
      },
      {
        title: "SRE Engineer",
        description: "Improve reliability with SLO monitoring and incident response.",
        location: "Remote",
        contractType: "Retainer",
        hiringManagerId: "Damian Wayne",
        experienceMin: 5,
        experienceMax: 11,
        status: "OPEN" as const,
      },
    ];

    await prisma.opening.deleteMany({
      where: {
        tenantId: tenant.tenantId,
      },
    });

    await prisma.opening.createMany({
      data: openings.map((opening) => ({
        tenantId: tenant.tenantId,
        title: opening.title,
        description: opening.description,
        location: opening.location,
        contractType: opening.contractType,
        hiringManagerId: opening.hiringManagerId,
        experienceMin: opening.experienceMin,
        experienceMax: opening.experienceMax,
        status: opening.status,
      })),
    });

    console.log(`✅ Seeded ${openings.length} openings for Bruce Wayne Corp`);

    console.log("✅ Openings seeded successfully");
  } catch (error) {
    console.error("❌ Error seeding openings:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seed function
seedOpenings();
