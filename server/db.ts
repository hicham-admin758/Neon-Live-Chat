import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// استخراج مسار قاعدة البيانات من DATABASE_URL
const dbPath = process.env.DATABASE_URL.replace("file:", "");

export const sqlite = new Database(dbPath);
export const db = drizzle(sqlite, { schema });
