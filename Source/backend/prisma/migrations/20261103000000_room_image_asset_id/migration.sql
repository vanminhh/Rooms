DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM room_images) THEN
    RAISE EXCEPTION 'Cannot add room_images.asset_id while room_images contains rows; backfill real Cloudinary asset IDs before retrying';
  END IF;
END
$$;

ALTER TABLE room_images
ADD COLUMN asset_id TEXT NOT NULL;

CREATE UNIQUE INDEX room_images_asset_id_key
ON room_images(asset_id);
