import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

// Singleton pool instance
let pool: Pool | null = null;

/**
 * Get or create the database connection pool.
 * In Cloud Run, connects via Unix socket to Cloud SQL.
 * Locally, connects via TCP using environment variables.
 */
function getPool(): Pool {
  if (!pool) {
    const connectionConfig = process.env.CLOUD_SQL_CONNECTION_NAME
      ? {
          // Cloud Run: Unix socket connection
          host: `/cloudsql/${process.env.CLOUD_SQL_CONNECTION_NAME}`,
          database: process.env.DB_NAME,
          user: process.env.DB_USER,
          password: process.env.DB_PASSWORD,
        }
      : {
          // Local development: TCP connection
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432', 10),
          database: process.env.DB_NAME || 'nes_scorecard',
          user: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD,
        };

    pool = new Pool({
      ...connectionConfig,
      max: 10, // Maximum connections in pool
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    // Log connection errors
    pool.on('error', (err) => {
      console.error('Unexpected database pool error:', err);
    });
  }

  return pool;
}

/**
 * Execute a parameterized query.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  const result = await getPool().query<T>(text, params);
  const duration = Date.now() - start;

  if (process.env.NODE_ENV === 'development') {
    console.log('Executed query', { text: text.substring(0, 100), duration, rows: result.rowCount });
  }

  return result;
}

/**
 * Get a client from the pool for transaction support.
 * Remember to call client.release() when done.
 */
export async function getClient(): Promise<PoolClient> {
  return getPool().connect();
}

/**
 * Execute a function within a transaction.
 * Automatically handles commit/rollback.
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient();

  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Close the pool (for graceful shutdown).
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
