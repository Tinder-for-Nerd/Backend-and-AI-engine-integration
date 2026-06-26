import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";
import { eq } from "drizzle-orm";

import { db } from "./client.js";
import { freelancers, projects, startups, subscriptions, users } from "./schema.js";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(process.cwd(), ".env"), override: false });
config({ path: resolve(process.cwd(), "../../.env"), override: false });
config({ path: resolve(here, "../../../.env"), override: false });
config({ path: resolve(here, "../../../../.env"), override: false });

async function seed() {
  const [startupUser] = await db
    .insert(users)
    .values({
      email: "founder@example.com",
      name: "Example Founder",
      role: "startup",
      emailVerified: true,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: { name: "Example Founder", role: "startup" },
    })
    .returning();

  const [freelancerUser] = await db
    .insert(users)
    .values({
      email: "freelancer@example.com",
      name: "Example Freelancer",
      role: "freelancer",
      emailVerified: true,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: { name: "Example Freelancer", role: "freelancer" },
    })
    .returning();

  if (!startupUser || !freelancerUser) {
    throw new Error("Seed users were not created.");
  }

  const [startup] = await db
    .insert(startups)
    .values({
      userId: startupUser.id,
      companyName: "NerdStack Labs",
      industry: "Developer Tools",
      companySize: "1-10",
      description: "Building collaboration tooling for technical founders.",
    })
    .onConflictDoUpdate({
      target: startups.userId,
      set: { companyName: "NerdStack Labs", industry: "Developer Tools" },
    })
    .returning();

  const [freelancer] = await db
    .insert(freelancers)
    .values({
      userId: freelancerUser.id,
      title: "Full-stack AI Engineer",
      bio: "Fastify, TypeScript, PostgreSQL, Redis, and applied AI systems.",
      hourlyRateCents: 9000,
      skills: ["TypeScript", "Fastify", "PostgreSQL", "Redis", "AI"],
    })
    .onConflictDoUpdate({
      target: freelancers.userId,
      set: { title: "Full-stack AI Engineer", skills: ["TypeScript", "Fastify", "PostgreSQL", "Redis", "AI"] },
    })
    .returning();

  if (startup) {
    await db.insert(projects).values({
      startupId: startup.id,
      title: "Build AI matching dashboard",
      description: "Create a production backend and dashboard for freelancer/startup matching.",
      budgetMinCents: 200000,
      budgetMaxCents: 600000,
      requiredSkills: ["TypeScript", "Fastify", "PostgreSQL", "Redis"],
      status: "open",
    });
  }

  await db.insert(subscriptions).values({ userId: startupUser.id, plan: "free", status: "active" }).onConflictDoNothing();
  await db.insert(subscriptions).values({ userId: freelancerUser.id, plan: "free", status: "active" }).onConflictDoNothing();

  const existingFreelancer = freelancer
    ? await db.select().from(freelancers).where(eq(freelancers.id, freelancer.id)).limit(1)
    : [];
  console.log(`Seed complete. Freelancer profile ready: ${existingFreelancer.length > 0}`);
}

await seed();
