CREATE TABLE IF NOT EXISTS content_projects (
  id text PRIMARY KEY,
  dealership_id text NOT NULL REFERENCES dealerships(id),
  vehicle_id text NOT NULL REFERENCES vehicles(id),
  created_by_id text NOT NULL REFERENCES users(id),
  template_key text NOT NULL,
  template_version integer NOT NULL DEFAULT 1,
  template_variant text NOT NULL DEFAULT 'STANDARD',
  status text NOT NULL DEFAULT 'DRAFT',
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text NOT NULL DEFAULT '',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_project_tenant_idx
  ON content_projects (dealership_id, created_at DESC);
CREATE INDEX IF NOT EXISTS content_project_vehicle_idx
  ON content_projects (dealership_id, vehicle_id);
CREATE INDEX IF NOT EXISTS content_project_status_idx
  ON content_projects (dealership_id, status);

-- Um projeto pode ser renderizado mais de uma vez (retry, ajuste manual),
-- então a tentativa é uma linha própria e o diagnóstico anterior é mantido.
CREATE TABLE IF NOT EXISTS render_jobs (
  id text PRIMARY KEY,
  dealership_id text NOT NULL REFERENCES dealerships(id),
  content_project_id text NOT NULL REFERENCES content_projects(id),
  attempt integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'QUEUED',
  engine_version text NOT NULL DEFAULT '',
  error_code text NOT NULL DEFAULT '',
  error_message text NOT NULL DEFAULT '',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS render_job_project_idx
  ON render_jobs (content_project_id, attempt DESC);
CREATE INDEX IF NOT EXISTS render_job_status_idx
  ON render_jobs (dealership_id, status);

CREATE TABLE IF NOT EXISTS generated_assets (
  id text PRIMARY KEY,
  dealership_id text NOT NULL REFERENCES dealerships(id),
  content_project_id text NOT NULL REFERENCES content_projects(id),
  render_job_id text REFERENCES render_jobs(id),
  source_media_id text REFERENCES vehicle_media(id),
  position integer NOT NULL DEFAULT 0,
  storage_key text NOT NULL,
  mime_type text NOT NULL DEFAULT 'image/png',
  width integer NOT NULL DEFAULT 0,
  height integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'OK',
  -- Enquadramento e QC: permitem reeditar e auditar sem reprocessar tudo.
  framing jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics jsonb,
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  detected_vehicle_type text NOT NULL DEFAULT '',
  photo_group text NOT NULL DEFAULT '',
  manually_adjusted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS generated_asset_project_idx
  ON generated_assets (content_project_id, position);
CREATE INDEX IF NOT EXISTS generated_asset_tenant_idx
  ON generated_assets (dealership_id, created_at DESC);
