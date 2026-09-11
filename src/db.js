import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/coupon_engine',
  connectionTimeoutMillis: 5000
});

export const query = async (text, params = []) => {
  const res = await pool.query(text, params);
  return res.rows;
};

export const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const runner = {
      query: async (text, params = []) => {
        const res = await client.query(text, params);
        return res.rows;
      }
    };
    const result = await callback(runner);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const initSchema = async () => {
  const schemaPath = path.join(__dirname, '../db/schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await query(sql);
};

export const close = async () => {
  await pool.end();
};

export default {
  query,
  transaction,
  initSchema,
  close,
  pool
};
