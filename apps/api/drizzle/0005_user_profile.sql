-- Optional personal profile details. All nullable: nothing here is mandatory.
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title varchar(120);
ALTER TABLE users ADD COLUMN IF NOT EXISTS team varchar(120);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone varchar(40);
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone varchar(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio text;
