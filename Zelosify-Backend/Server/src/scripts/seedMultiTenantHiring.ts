import prisma from "../config/prisma/prisma.js";

/**
 * Multi-tenant hiring seed
 * - Creates/updates 2 tenants
 * - Creates/updates hiring managers and vendors per tenant
 * - Creates/updates openings mapped to hiring managers in the same tenant
 *
 * Note:
 * - User model has no password column in current Prisma schema.
 * - Opening model has no requiredSkills array column, so required skills are embedded in description.
 */

type SeedUser = {
  id: string;
  tenantId: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "HIRING_MANAGER" | "IT_VENDOR";
  externalId: string;
};

type SeedOpening = {
  id: string;
  tenantId: string;
  title: string;
  requiredSkills: string[];
  experienceBand: "2-4" | "5-8" | "8+";
  location: string;
  contractType: string;
  hiringManagerId: string;
};

const TENANTS = [
  {
    tenantId: "f2a88f2f-2f8c-4b2d-85f0-8cf9877c7b01",
    companyName: "Stark Industries",
  },
  {
    tenantId: "e95ef2ac-d35d-4dd2-8720-5bfae5a7e202",
    companyName: "Wayne Enterprises Tech",
  },
] as const;

const USERS: SeedUser[] = [
  // Stark Industries: 2 Hiring Managers + 2 Vendors
  {
    id: "9a74ea16-f1bb-4e7e-9a08-aac9c0d31a11",
    tenantId: TENANTS[0].tenantId,
    username: "stark.hm.tony",
    email: "tony.stark.hm@stark-industries.com",
    firstName: "Tony",
    lastName: "Stark",
    role: "HIRING_MANAGER",
    externalId: "ext-stark-hm-tony",
  },
  {
    id: "78635d13-c27e-46f4-91ee-a50c8f8d1122",
    tenantId: TENANTS[0].tenantId,
    username: "stark.hm.pepper",
    email: "pepper.potts.hm@stark-industries.com",
    firstName: "Pepper",
    lastName: "Potts",
    role: "HIRING_MANAGER",
    externalId: "ext-stark-hm-pepper",
  },
  {
    id: "ed1a532e-bcb2-4ff5-9ecf-3d9b8ed2f133",
    tenantId: TENANTS[0].tenantId,
    username: "stark.vendor.rhodey",
    email: "james.rhodes.vendor@stark-industries.com",
    firstName: "James",
    lastName: "Rhodes",
    role: "IT_VENDOR",
    externalId: "ext-stark-vendor-rhodey",
  },
  {
    id: "6fd3a0f5-df16-4d86-9f13-d55d8709a144",
    tenantId: TENANTS[0].tenantId,
    username: "stark.vendor.happy",
    email: "happy.hogan.vendor@stark-industries.com",
    firstName: "Happy",
    lastName: "Hogan",
    role: "IT_VENDOR",
    externalId: "ext-stark-vendor-happy",
  },

  // Wayne Enterprises Tech: 2 Hiring Managers + 2 Vendors
  {
    id: "f64d8f0b-b2de-4b1b-b6c8-a3f5777cb211",
    tenantId: TENANTS[1].tenantId,
    username: "wayne.hm.lucius",
    email: "lucius.fox.hm@wayne-enterprises-tech.com",
    firstName: "Lucius",
    lastName: "Fox",
    role: "HIRING_MANAGER",
    externalId: "ext-wayne-hm-lucius",
  },
  {
    id: "7ea3460c-6797-46c0-a50f-0046f94ef222",
    tenantId: TENANTS[1].tenantId,
    username: "wayne.hm.barbara",
    email: "barbara.gordon.hm@wayne-enterprises-tech.com",
    firstName: "Barbara",
    lastName: "Gordon",
    role: "HIRING_MANAGER",
    externalId: "ext-wayne-hm-barbara",
  },
  {
    id: "c5b73f92-3678-4de0-9a92-df9641fa0233",
    tenantId: TENANTS[1].tenantId,
    username: "wayne.vendor.alfred",
    email: "alfred.pennyworth.vendor@wayne-enterprises-tech.com",
    firstName: "Alfred",
    lastName: "Pennyworth",
    role: "IT_VENDOR",
    externalId: "ext-wayne-vendor-alfred",
  },
  {
    id: "2c88f831-5739-4f5a-a275-f077d9085344",
    tenantId: TENANTS[1].tenantId,
    username: "wayne.vendor.selina",
    email: "selina.kyle.vendor@wayne-enterprises-tech.com",
    firstName: "Selina",
    lastName: "Kyle",
    role: "IT_VENDOR",
    externalId: "ext-wayne-vendor-selina",
  },
];

const STARK_OPENINGS: SeedOpening[] = [
  {
    id: "c4f3524e-a801-469a-9789-111111110001",
    tenantId: TENANTS[0].tenantId,
    title: "Backend Developer - Node.js",
    requiredSkills: ["Node.js", "TypeScript", "PostgreSQL", "Redis"],
    experienceBand: "2-4",
    location: "Bengaluru",
    contractType: "Contract",
    hiringManagerId: "9a74ea16-f1bb-4e7e-9a08-aac9c0d31a11",
  },
  {
    id: "c4f3524e-a801-469a-9789-111111110002",
    tenantId: TENANTS[0].tenantId,
    title: "Backend Developer - Java",
    requiredSkills: ["Java", "Spring Boot", "Kafka", "MySQL"],
    experienceBand: "5-8",
    location: "Hyderabad",
    contractType: "Contract",
    hiringManagerId: "78635d13-c27e-46f4-91ee-a50c8f8d1122",
  },
  {
    id: "c4f3524e-a801-469a-9789-111111110003",
    tenantId: TENANTS[0].tenantId,
    title: "Frontend Developer - React",
    requiredSkills: ["React", "TypeScript", "Redux", "Jest"],
    experienceBand: "2-4",
    location: "Chennai",
    contractType: "Time & Material",
    hiringManagerId: "9a74ea16-f1bb-4e7e-9a08-aac9c0d31a11",
  },
  {
    id: "c4f3524e-a801-469a-9789-111111110004",
    tenantId: TENANTS[0].tenantId,
    title: "Frontend Developer - Angular",
    requiredSkills: ["Angular", "RxJS", "NgRx", "TypeScript"],
    experienceBand: "5-8",
    location: "Pune",
    contractType: "Contract",
    hiringManagerId: "78635d13-c27e-46f4-91ee-a50c8f8d1122",
  },
  {
    id: "c4f3524e-a801-469a-9789-111111110005",
    tenantId: TENANTS[0].tenantId,
    title: "Data Scientist",
    requiredSkills: ["Python", "Pandas", "Scikit-learn", "SQL"],
    experienceBand: "5-8",
    location: "Mumbai",
    contractType: "Contract",
    hiringManagerId: "9a74ea16-f1bb-4e7e-9a08-aac9c0d31a11",
  },
  {
    id: "c4f3524e-a801-469a-9789-111111110006",
    tenantId: TENANTS[0].tenantId,
    title: "DevOps Engineer",
    requiredSkills: ["AWS", "Docker", "Kubernetes", "Terraform"],
    experienceBand: "5-8",
    location: "Bengaluru",
    contractType: "Retainer",
    hiringManagerId: "78635d13-c27e-46f4-91ee-a50c8f8d1122",
  },
  {
    id: "c4f3524e-a801-469a-9789-111111110007",
    tenantId: TENANTS[0].tenantId,
    title: "QA Engineer",
    requiredSkills: ["Selenium", "Cypress", "API Testing", "Postman"],
    experienceBand: "2-4",
    location: "Remote",
    contractType: "Contract",
    hiringManagerId: "9a74ea16-f1bb-4e7e-9a08-aac9c0d31a11",
  },
  {
    id: "c4f3524e-a801-469a-9789-111111110008",
    tenantId: TENANTS[0].tenantId,
    title: "Full Stack Developer",
    requiredSkills: ["Node.js", "React", "GraphQL", "PostgreSQL"],
    experienceBand: "5-8",
    location: "Chennai",
    contractType: "Time & Material",
    hiringManagerId: "78635d13-c27e-46f4-91ee-a50c8f8d1122",
  },
  {
    id: "c4f3524e-a801-469a-9789-111111110009",
    tenantId: TENANTS[0].tenantId,
    title: "Senior Platform Engineer",
    requiredSkills: ["Go", "Kubernetes", "Prometheus", "AWS"],
    experienceBand: "8+",
    location: "Hyderabad",
    contractType: "Contract",
    hiringManagerId: "9a74ea16-f1bb-4e7e-9a08-aac9c0d31a11",
  },
  {
    id: "c4f3524e-a801-469a-9789-111111110010",
    tenantId: TENANTS[0].tenantId,
    title: "ML Engineer",
    requiredSkills: ["Python", "PyTorch", "MLOps", "Docker"],
    experienceBand: "8+",
    location: "Remote",
    contractType: "Fixed Bid",
    hiringManagerId: "78635d13-c27e-46f4-91ee-a50c8f8d1122",
  },
];

const WAYNE_OPENINGS: SeedOpening[] = [
  {
    id: "d8a1cb59-d0ec-48f9-a26c-222222220001",
    tenantId: TENANTS[1].tenantId,
    title: "Backend Developer - Node.js",
    requiredSkills: ["Node.js", "Express", "TypeScript", "MongoDB"],
    experienceBand: "2-4",
    location: "Bengaluru",
    contractType: "Contract",
    hiringManagerId: "f64d8f0b-b2de-4b1b-b6c8-a3f5777cb211",
  },
  {
    id: "d8a1cb59-d0ec-48f9-a26c-222222220002",
    tenantId: TENANTS[1].tenantId,
    title: "Frontend Developer - React",
    requiredSkills: ["React", "JavaScript", "Redux", "Tailwind"],
    experienceBand: "2-4",
    location: "Chennai",
    contractType: "Time & Material",
    hiringManagerId: "7ea3460c-6797-46c0-a50f-0046f94ef222",
  },
  {
    id: "d8a1cb59-d0ec-48f9-a26c-222222220003",
    tenantId: TENANTS[1].tenantId,
    title: "Data Scientist",
    requiredSkills: ["Python", "NumPy", "Scikit-learn", "SQL"],
    experienceBand: "5-8",
    location: "Hyderabad",
    contractType: "Contract",
    hiringManagerId: "f64d8f0b-b2de-4b1b-b6c8-a3f5777cb211",
  },
  {
    id: "d8a1cb59-d0ec-48f9-a26c-222222220004",
    tenantId: TENANTS[1].tenantId,
    title: "DevOps Engineer",
    requiredSkills: ["AWS", "Docker", "Kubernetes", "Jenkins"],
    experienceBand: "5-8",
    location: "Pune",
    contractType: "Retainer",
    hiringManagerId: "7ea3460c-6797-46c0-a50f-0046f94ef222",
  },
  {
    id: "d8a1cb59-d0ec-48f9-a26c-222222220005",
    tenantId: TENANTS[1].tenantId,
    title: "Principal Full Stack Engineer",
    requiredSkills: ["Node.js", "React", "System Design", "AWS"],
    experienceBand: "8+",
    location: "Remote",
    contractType: "Fixed Bid",
    hiringManagerId: "f64d8f0b-b2de-4b1b-b6c8-a3f5777cb211",
  },
];

function toExperienceRange(experienceBand: SeedOpening["experienceBand"]): {
  experienceMin: number;
  experienceMax: number | null;
} {
  if (experienceBand === "2-4") {
    return { experienceMin: 2, experienceMax: 4 };
  }
  if (experienceBand === "5-8") {
    return { experienceMin: 5, experienceMax: 8 };
  }
  return { experienceMin: 8, experienceMax: null };
}

function buildDescription(opening: SeedOpening): string {
  return [
    `Role: ${opening.title}`,
    `Required Skills: ${opening.requiredSkills.join(", ")}`,
    `Experience Required: ${opening.experienceBand} years`,
    `Location: ${opening.location}`,
    "Responsibilities: design, develop, test, deploy, and support production systems.",
  ].join("\n");
}

async function seedTenants() {
  for (const tenant of TENANTS) {
    await prisma.tenants.upsert({
      where: { tenantId: tenant.tenantId },
      update: {
        companyName: tenant.companyName,
      },
      create: {
        tenantId: tenant.tenantId,
        companyName: tenant.companyName,
      },
    });
  }
}

async function seedUsers() {
  for (const user of USERS) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        tenantId: user.tenantId,
        externalId: user.externalId,
        profileComplete: true,
      },
      create: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        tenantId: user.tenantId,
        externalId: user.externalId,
        profileComplete: true,
      },
    });
  }
}

async function seedOpenings() {
  const openings = [...STARK_OPENINGS, ...WAYNE_OPENINGS];

  for (const opening of openings) {
    const { experienceMin, experienceMax } = toExperienceRange(opening.experienceBand);

    await prisma.opening.upsert({
      where: { id: opening.id },
      update: {
        tenantId: opening.tenantId,
        title: opening.title,
        description: buildDescription(opening),
        location: opening.location,
        contractType: opening.contractType,
        hiringManagerId: opening.hiringManagerId,
        experienceMin,
        experienceMax,
        status: "OPEN",
      },
      create: {
        id: opening.id,
        tenantId: opening.tenantId,
        title: opening.title,
        description: buildDescription(opening),
        location: opening.location,
        contractType: opening.contractType,
        hiringManagerId: opening.hiringManagerId,
        experienceMin,
        experienceMax,
        status: "OPEN",
      },
    });
  }
}

async function main() {
  console.log("🌱 Seeding multi-tenant hiring data...");

  await seedTenants();
  console.log("✅ Tenants seeded: Stark Industries, Wayne Enterprises Tech");

  await seedUsers();
  console.log("✅ Users seeded for both tenants (HIRING_MANAGER + IT_VENDOR)");

  await seedOpenings();
  console.log("✅ Openings seeded: 10 for Stark Industries, 5 for Wayne Enterprises Tech");

  console.log("🎉 Multi-tenant seed completed successfully");
}

main()
  .catch((error) => {
    console.error("❌ Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
