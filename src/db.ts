import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";

mkdirSync("./data", { recursive: true });

export const db = new Database("./data/auth.db", { create: true });
// Enable WAL mode for better concurrent read performance
db.run("PRAGMA journal_mode=WAL");
