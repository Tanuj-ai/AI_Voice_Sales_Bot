create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  language text not null check (language in ('en-IN', 'hi-IN')),
  consent_given boolean not null default false,
  consent_timestamp timestamptz,
  transcript jsonb not null default '[]'::jsonb,
  recording_path text,
  summary text,
  customer_requirements jsonb not null default '[]'::jsonb,
  objections jsonb not null default '[]'::jsonb,
  next_steps jsonb not null default '[]'::jsonb,
  status text check (
    status is null or status in (
      'Converted',
      'Interested',
      'Follow-up Required',
      'Not Interested',
      'Demo Requested',
      'No Response'
    )
  ),
  status_reason text,
  constraint calls_consent_timestamp_required check (
    not consent_given or consent_timestamp is not null
  )
);

create index if not exists calls_started_at_idx on public.calls (started_at desc);

alter table public.calls enable row level security;

insert into storage.buckets (id, name, public)
values ('recordings', 'recordings', false)
on conflict (id) do update set public = false;
