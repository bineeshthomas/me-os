import pg from "pg";
import "dotenv/config";

// Return DATE columns as plain "YYYY-MM-DD" strings (not JS Dates, which shift with the time zone)
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
