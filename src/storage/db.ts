// src/storage/db.ts
import { openDatabaseAsync, SQLiteDatabase } from 'expo-sqlite';

let dbPromise: Promise<SQLiteDatabase> | null = null;

export const dbAsync = () => {
  // OPTIONAL: bump DB name once if you want to force a fresh schema on all devices:
  // if (!dbPromise) dbPromise = openDatabaseAsync('netball_v2.db');
  if (!dbPromise) dbPromise = openDatabaseAsync('netball_v3.db');
  return dbPromise;
};

async function columnExists(table: string, name: string) {
  const db = await dbAsync();
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table});`);
  return rows.some((r) => r.name === name);
}

async function ensureColumn(table: string, name: string, type: string) {
  const exists = await columnExists(table, name);
  if (!exists) {
    const db = await dbAsync();
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${name} ${type};`);
  }
}

export const initDb = async () => {
  const db = await dbAsync();

  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    create table if not exists team (
      id text primary key,
      name text not null
    );

    create table if not exists player (
      id text primary key,
      team_id text,
      first_name text,
      last_name text,
      positions text,
      notes text
    );

    create table if not exists match (
      id text primary key,
      team_id text,
      opponent text,
      match_date text,
      competition text,
      venue text
    );

    create table if not exists period (
      id text primary key,
      match_id text,
      number integer,
      seconds_played integer default 0
    );

    create table if not exists lineup (
      id text primary key,
      match_id text,
      period_id text,
      started_at text,
      ended_at text
    );

    create table if not exists lineup_player (
      id text primary key,
      lineup_id text,
      player_id text,
      position text
    );

    create table if not exists event (
      id text primary key,
      match_id text,
      period_id text,
      player_id text,
      type text,
      position_at_time text,
      x real,
      y real,
      ts text,
      meta text
    );
  `);

  // From earlier updates
  await ensureColumn('player', 'photo_uri', 'text');
  await ensureColumn('match', 'home_team', 'text');
  await ensureColumn('match', 'away_team', 'text');
  await ensureColumn('match', 'start_ts', 'text');
  await ensureColumn('match', 'end_ts', 'text');
  await ensureColumn('match', 'duration_seconds', 'integer default 0');

  // NEW: per-quarter scores + timestamps (for Q start/stop)
  await ensureColumn('period', 'home_score', 'integer default 0');
  await ensureColumn('period', 'away_score', 'integer default 0');
  await ensureColumn('period', 'started_at', 'text');
  await ensureColumn('period', 'ended_at', 'text');
  
  
// ✅ STEP 1: preserve starter/sub ordering forever
  await ensureColumn('lineup_player', 'appearance_order', 'integer');

};

// quick diagnostics (optional)
export const listTables = async () => {
  const db = await dbAsync();
  return db.getAllAsync<{ name: string }>(
    `select name from sqlite_master where type='table' order by name`
  );
};

export const run = async (sql: string, params: any[] = []) => {
  const db = await dbAsync();
  return db.runAsync(sql, params);
};

export const all = async <T = any>(sql: string, params: any[] = []) => {
  const db = await dbAsync();
  return db.getAllAsync<T>(sql, params);
};

export const get = async <T = any>(sql: string, params: any[] = []) => {
  const db = await dbAsync();
  return db.getFirstAsync<T>(sql, params);
};
