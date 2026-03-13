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

  // Create admin user
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

  // Create IT admin
  const [itAdmin] = await db
    .insert(schema.users)
    .values({
      email: "it@agency.com",
      name: "IT Admin",
      passwordHash,
      role: "it_admin",
    })
    .onConflictDoNothing()
    .returning();

  if (itAdmin) {
    console.log("Created IT admin user:", itAdmin.email);
  } else {
    console.log("IT admin user already exists");
  }

  // Create sample agent
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

    // Create billing record
    await db
      .insert(schema.agentBilling)
      .values({ agentId: agent.id })
      .onConflictDoNothing();
  } else {
    console.log("Sample agent already exists");
  }

  console.log("\nDefault password for all users: admin123");
  console.log("Done!");
}

seed().catch(console.error);
