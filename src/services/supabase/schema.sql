-- gluciq cloud schema (draft). Mirrors src/types/models.ts.
-- Glucose is stored in mg/dL. Every table is owner-scoped via RLS.

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  glucose_unit text not null default 'mg/dL' check (glucose_unit in ('mg/dL', 'mmol/L')),
  created_at timestamptz not null default now()
);

create table insulin_profiles (
  user_id uuid primary key references auth.users on delete cascade,
  target_glucose numeric not null,
  correction_factor numeric not null,
  insulin_duration_hours numeric not null,
  insulin_peak_minutes numeric not null default 75,
  max_bolus numeric not null,
  min_glucose_for_bolus numeric not null default 70,
  dose_increment numeric not null default 0.5,
  carb_ratios jsonb not null,
  updated_at timestamptz not null default now()
);

create table glucose_readings (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  value numeric not null check (value between 20 and 600),
  timestamp timestamptz not null,
  trend text,
  context text,
  note text,
  source text not null check (source in ('manual', 'healthkit', 'cgm'))
);
create index on glucose_readings (user_id, timestamp desc);

create table insulin_doses (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  units numeric not null check (units > 0),
  insulin_type text,
  timestamp timestamptz not null,
  source text not null check (source in ('manual', 'bolus-calculator')),
  calculation_id text,
  note text
);
create index on insulin_doses (user_id, timestamp desc);

create table meals (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  name text,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  items jsonb not null default '[]',
  calories numeric not null,
  carbs numeric not null,
  protein numeric not null,
  fat numeric not null,
  fiber numeric,
  sugar numeric,
  timestamp timestamptz not null
);
create index on meals (user_id, timestamp desc);

create table weight_entries (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  weight_kg numeric not null,
  body_fat_pct numeric,
  timestamp timestamptz not null,
  source text not null
);

-- Append-only audit trail of every confirmed calculation.
create table bolus_calculations (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  current_glucose numeric not null,
  target_glucose numeric not null,
  carbs numeric not null,
  carb_ratio numeric not null,
  correction_factor numeric not null,
  active_insulin numeric not null,
  meal_type text not null,
  meal_bolus numeric not null,
  correction_bolus numeric not null,
  active_insulin_adjustment numeric not null,
  suggested_bolus numeric not null,
  confirmed_units numeric,
  warnings jsonb not null default '[]',
  calculation_version text not null,
  timestamp timestamptz not null
);

do $$
declare t text;
begin
  foreach t in array array['glucose_readings','insulin_doses','meals','weight_entries','bolus_calculations','insulin_profiles'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy owner_all on %I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;

alter table profiles enable row level security;
create policy owner_all on profiles for all using (auth.uid() = id) with check (auth.uid() = id);

-- Calculations are an audit log: no updates or deletes from clients.
drop policy owner_all on bolus_calculations;
create policy owner_read on bolus_calculations for select using (auth.uid() = user_id);
create policy owner_insert on bolus_calculations for insert with check (auth.uid() = user_id);
