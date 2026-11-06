import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from './node_modules/@electric-sql/pglite/dist/index.js';

const migrationPath = fileURLToPath(
  new URL('../prisma/migrations/20261103000000_room_image_asset_id/migration.sql', import.meta.url),
);
const migrationSql = readFileSync(migrationPath, 'utf8');

function roomImagesBaseline() {
  // PGlite is an isolated in-memory PostgreSQL edge; each scenario owns and closes its database.
  return new PGlite();
}

describe('draft room image asset ID migration', () => {
  it('ROOM-07/DB-07: migrates an empty legacy table and enforces required unique asset IDs', async () => {
    const db = roomImagesBaseline();
    try {
      await db.exec(`
        CREATE TABLE room_images (
          id SERIAL PRIMARY KEY,
          room_id INTEGER NOT NULL,
          url TEXT NOT NULL,
          public_id TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0
        );
      `);
      await db.exec(migrationSql);

      const columns = await db.query<{ column_name: string; is_nullable: string }>(`
        SELECT column_name, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'room_images' AND column_name = 'asset_id'
      `);
      expect(columns.rows).toEqual([{ column_name: 'asset_id', is_nullable: 'NO' }]);

      await db.exec(`INSERT INTO room_images (room_id, url, public_id, asset_id) VALUES
        (1, 'https://example.test/a.jpg', 'rooms/1/1/a', 'asset-a')`);
      await expect(db.exec(`INSERT INTO room_images (room_id, url, public_id, asset_id) VALUES
        (2, 'https://example.test/b.jpg', 'rooms/2/2/b', 'asset-a')`)).rejects.toThrow();
      await expect(db.exec(`INSERT INTO room_images (room_id, url, public_id, asset_id) VALUES
        (2, 'https://example.test/c.jpg', 'rooms/2/2/c', NULL)`)).rejects.toThrow();
    } finally {
      await db.close();
    }
  });

  it('ROOM-07/DB-07: rejects a legacy image row and preserves it without inventing an asset ID', async () => {
    const db = roomImagesBaseline();
    try {
      await db.exec(`
        CREATE TABLE room_images (
          id SERIAL PRIMARY KEY,
          room_id INTEGER NOT NULL,
          url TEXT NOT NULL,
          public_id TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO room_images (room_id, url, public_id)
        VALUES (42, 'https://example.test/legacy.jpg', 'rooms/7/42/legacy');
      `);

      await expect(db.exec(migrationSql)).rejects.toThrow(/backfill real Cloudinary asset IDs/i);

      const rows = await db.query<{ id: number; room_id: number; public_id: string }>(
        'SELECT id, room_id, public_id FROM room_images',
      );
      expect(rows.rows).toEqual([{ id: 1, room_id: 42, public_id: 'rooms/7/42/legacy' }]);
      const assetColumn = await db.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'room_images' AND column_name = 'asset_id'
      `);
      expect(assetColumn.rows).toEqual([]);
    } finally {
      await db.close();
    }
  });
});
