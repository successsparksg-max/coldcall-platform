/**
 * Optional seed script — only needed if you want to pre-populate
 * test users via CLI instead of through the IT admin UI.
 *
 * Usage: npx tsx scripts/seed.ts
 *
 * Note: The IT admin user is NOT stored in the database.
 * IT admin credentials are set via environment variables:
 *   IT_ADMIN_USERNAME and IT_ADMIN_PASSWORD
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import bcrypt from "bcryptjs";
import * as schema from "../lib/schema";

async function seed() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const sql = neon(url);
  const db = drizzle(sql, { schema });

  const passwordHash = await bcrypt.hash("admin123", 12);

  // Create a sample admin (agency head)
  const [admin] = await db
    .insert(schema.users)
    .values({
      email: "admin@agency.com",
      name: "Agency Admin",
      passwordHash,
      role: "admin",
    })
    .onConflictDoNothing()
    .returning();

  if (admin) {
    console.log("Created admin user:", admin.email);
  } else {
    console.log("Admin user already exists");
  }

  // Create a sample agent
  const [agent] = await db
    .insert(schema.users)
    .values({
      email: "agent@agency.com",
      name: "Sample Agent",
      passwordHash,
      role: "agent",
    })
    .onConflictDoNothing()
    .returning();

  if (agent) {
    console.log("Created sample agent:", agent.email);
    await db
      .insert(schema.agentBilling)
      .values({ agentId: agent.id })
      .onConflictDoNothing();
  } else {
    console.log("Sample agent already exists");
  }

  console.log("\nDefault password for DB users: admin123");
  console.log("IT admin login: use IT_ADMIN_USERNAME / IT_ADMIN_PASSWORD from .env.local");
  console.log("Done!");
}

seed().catch(console.error);
