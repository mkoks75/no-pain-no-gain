-- ─────────────────────────────────────────────
-- NO PAIN NO GAIN — PostgreSQL Schema
-- Voer uit via: psql -U npng -d npng -f schema.sql
-- ─────────────────────────────────────────────

-- 1. GEBRUIKERS
create table if not exists users (
    id            serial primary key,
    name          text not null,
    email         text not null unique,
    password_hash text not null,
    is_admin      boolean not null default false,
    created_at    timestamptz default now()
);

-- 2. PROFIELEN
create table if not exists profiles (
    id                  serial primary key,
    user_id             int unique references users(id) on delete cascade,
    goal                text not null default 'hypertrofie'
                            check (goal in ('kracht','hypertrofie','algemeen','power')),
    intensity_mode      text not null default 'rir'
                            check (intensity_mode in ('1rm','rir')),
    weekly_set_targets  jsonb not null default '{
        "borst":10,"rug":10,"schouders":10,
        "biceps":8,"triceps":8,"quadriceps":10,
        "hamstrings":8,"billen":8,"kuiten":6,"core":8
    }'::jsonb,
    block_weeks         integer not null default 4,
    rotation_bump       integer not null default 0
);

-- 3. OEFENINGEN
create table if not exists exercises (
    id                  serial primary key,
    wger_id             int unique,
    name_nl             text,
    name_en             text not null,
    category            text,
    equipment           text[] default '{}',
    muscles_primary     text[] default '{}',
    muscles_secondary   text[] default '{}',
    image_url           text,
    description         text,
    available_home      boolean not null default false,
    available_gym       boolean not null default true,
    is_cardio           boolean not null default false,
    hidden              boolean not null default false,
    custom_description  text,
    custom_image_url    text
);

-- 3a. FAVORIETEN
create table if not exists favorites (
    user_id     integer not null references users(id) on delete cascade,
    exercise_id integer not null references exercises(id) on delete cascade,
    created_at  timestamptz default now(),
    primary key (user_id, exercise_id)
);

-- 4. WEEKPLANNEN
create table if not exists week_plans (
    id          serial primary key,
    user_id     int not null references users(id) on delete cascade,
    week_start  date not null,
    status      text not null default 'draft'
                    check (status in ('draft','active','completed')),
    created_at  timestamptz default now(),
    unique (user_id, week_start)
);

-- 5. DAGPLANNEN
create table if not exists day_plans (
    id           serial primary key,
    week_plan_id int not null references week_plans(id) on delete cascade,
    date         date not null,
    location     text not null check (location in ('thuis','sportschool'))
);

-- 6. GEPLANDE OEFENINGEN
create table if not exists plan_exercises (
    id               serial primary key,
    day_plan_id      int not null references day_plans(id) on delete cascade,
    exercise_id      int not null references exercises(id),
    order_idx        int not null default 0,
    block_type       text not null default 'strength'
                         check (block_type in ('strength','cardio')),
    target_sets      int,
    target_reps      int,
    target_weight    numeric(6,2),
    target_time_sec  int,
    rest_sec         int default 90
);

-- 7. WORKOUT SESSIES
create table if not exists workout_sessions (
    id           serial primary key,
    user_id      int not null references users(id) on delete cascade,
    day_plan_id  int references day_plans(id),
    started_at   timestamptz not null default now(),
    finished_at  timestamptz,
    notes        text
);

-- 8. GELOGDE SETS
create table if not exists session_sets (
    id           serial primary key,
    session_id   int not null references workout_sessions(id) on delete cascade,
    exercise_id  int not null references exercises(id),
    set_number   int not null,
    reps         int,
    weight       numeric(6,2),
    time_sec     int,
    completed    boolean not null default false,
    logged_at    timestamptz default now()
);

-- INDEXES
create index if not exists idx_week_plans_user    on week_plans(user_id);
create index if not exists idx_day_plans_week     on day_plans(week_plan_id);
create index if not exists idx_plan_ex_day        on plan_exercises(day_plan_id);
create index if not exists idx_sessions_user      on workout_sessions(user_id);
create index if not exists idx_session_sets_sess  on session_sets(session_id);
create index if not exists idx_ex_muscles         on exercises using gin(muscles_primary);
create index if not exists idx_exercises_hidden   on exercises(hidden);
create index if not exists idx_favorites_user     on favorites(user_id);
