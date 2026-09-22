CREATE TABLE IF NOT EXISTS customers (
  id text PRIMARY KEY,
  dealership_id text NOT NULL REFERENCES dealerships(id),
  created_by_id text NOT NULL REFERENCES users(id),
  name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  whatsapp text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Listing and search are always scoped to one dealership.
CREATE INDEX IF NOT EXISTS customer_tenant_idx ON customers (dealership_id, created_at DESC);
CREATE INDEX IF NOT EXISTS customer_phone_idx ON customers (dealership_id, phone);

CREATE TABLE IF NOT EXISTS leads (
  id text PRIMARY KEY,
  dealership_id text NOT NULL REFERENCES dealerships(id),
  customer_id text NOT NULL REFERENCES customers(id),
  vehicle_id text REFERENCES vehicles(id),
  assigned_to_user_id text REFERENCES users(id),
  created_by_id text NOT NULL REFERENCES users(id),
  source text NOT NULL DEFAULT 'OTHER',
  stage text NOT NULL DEFAULT 'NEW',
  notes text NOT NULL DEFAULT '',
  last_contact_at timestamptz,
  next_action_at timestamptz,
  lost_reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- The board reads one column at a time; the rest serve the filtered views.
CREATE INDEX IF NOT EXISTS lead_stage_idx ON leads (dealership_id, stage, updated_at DESC);
CREATE INDEX IF NOT EXISTS lead_assigned_idx ON leads (dealership_id, assigned_to_user_id, stage);
CREATE INDEX IF NOT EXISTS lead_vehicle_idx ON leads (dealership_id, vehicle_id);
CREATE INDEX IF NOT EXISTS lead_customer_idx ON leads (dealership_id, customer_id);

CREATE TABLE IF NOT EXISTS crm_activities (
  id text PRIMARY KEY,
  dealership_id text NOT NULL REFERENCES dealerships(id),
  lead_id text NOT NULL REFERENCES leads(id),
  user_id text NOT NULL REFERENCES users(id),
  type text NOT NULL DEFAULT 'NOTE',
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_lead_idx ON crm_activities (lead_id, created_at DESC);
