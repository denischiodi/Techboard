import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL;
const command = process.argv.slice(2).join(" ");
const needsDatabase = /\b(migrate|push|studio|introspect)\b/.test(command);

if (!connectionString && needsDatabase) {
  throw new Error("DATABASE_URL is required for drizzle database commands");
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: connectionString ?? "mysql://user:password@localhost:3306/delivery_resource_planner",
  },
});
