-- Multi-Tenant AI Cold-Calling Platform — Database Schema
-- Run against NeonDB to create all tables

-- ============================================================
-- USERS & AUTH
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT,
    role TEXT NOT NULL CHECK (role IN ('agent', 'admin', 'it_admin')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- AGENT CREDENTIALS (per-tenant external service accounts)
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    elevenlabs_api_key TEXT NOT NULL,
    elevenlabs_agent_id TEXT NOT NULL,
    elevenlabs_webhook_secret TEXT,

    telephony_provider TEXT NOT NULL CHECK (telephony_provider IN ('twilio', 'didww')),

    elevenlabs_phone_number_id TEXT,
    didww_phone_number TEXT,
    outbound_caller_id TEXT,

    credentials_complete BOOLEAN DEFAULT false,
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ DEFAULT now(),

    UNIQUE(agent_id),

    CONSTRAINT twilio_fields_required CHECK (
        telephony_provider != 'twilio' OR elevenlabs_phone_number_id IS NOT NULL
    ),
    CONSTRAINT didww_fields_required CHECK (
        telephony_provider != 'didww' OR didww_phone_number IS NOT NULL
    )
);

-- ============================================================
-- BILLING / SUBSCRIPTION TRACKING
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_billing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan TEXT NOT NULL DEFAULT 'basic',
    is_paid BOOLEAN DEFAULT false,
    billing_cycle_start DATE,
    billing_cycle_end DATE,
    notes TEXT,
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(agent_id)
);

-- ============================================================
-- CALL LISTS
-- ============================================================

CREATE TABLE IF NOT EXISTS call_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    original_filename TEXT NOT NULL,
    file_hash TEXT,
    uploaded_at TIMESTAMPTZ DEFAULT now(),

    parse_status TEXT NOT NULL DEFAULT 'parsed'
        CHECK (parse_status IN ('parsed', 'failed')),
    validation_errors JSONB,

    call_status TEXT NOT NULL DEFAULT 'ready'
        CHECK (call_status IN ('ready', 'in_progress', 'paused', 'completed', 'cancelled')),
    total_numbers INTEGER DEFAULT 0,
    calls_made INTEGER DEFAULT 0,
    calls_answered INTEGER DEFAULT 0,
    calls_no_answer INTEGER DEFAULT 0,
    calls_failed INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_call_lists_agent ON call_lists(agent_id);
CREATE INDEX IF NOT EXISTS idx_call_lists_status ON call_lists(call_status);

-- ============================================================
-- CALL ENTRIES
-- ============================================================

CREATE TABLE IF NOT EXISTS call_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_list_id UUID NOT NULL REFERENCES call_lists(id) ON DELETE CASCADE,

    phone_number TEXT NOT NULL,
    contact_name TEXT NOT NULL,
    company TEXT,
    policy_type TEXT,
    preferred_time TEXT,
    language TEXT,
    notes TEXT,

    call_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (call_status IN (
            'pending', 'calling', 'called', 'answered',
            'no_answer', 'busy', 'failed', 'skipped'
        )),

    conversation_id TEXT,
    telephony_call_sid TEXT,
    call_duration_seconds INTEGER,
    call_started_at TIMESTAMPTZ,
    call_ended_at TIMESTAMPTZ,

    sort_order INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_entries_list ON call_entries(call_list_id);
CREATE INDEX IF NOT EXISTS idx_call_entries_status ON call_entries(call_list_id, call_status);

-- ============================================================
-- CALLS (with post-call analysis)
-- ============================================================

CREATE TABLE IF NOT EXISTS calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_entry_id UUID REFERENCES call_entries(id),

    call_time TIMESTAMPTZ DEFAULT now(),
    calling_number TEXT,
    phone_number TEXT,
    conversation_id TEXT,
    call_id TEXT,
    number_status TEXT DEFAULT 'busy'
        CHECK (number_status IN ('busy', 'idle')),

    duration INTEGER,
    call_cost DECIMAL(10,4),

    rating INTEGER CHECK (rating BETWEEN 1 AND 5),
    summary TEXT,
    email TEXT,
    name TEXT,
    booking_status TEXT CHECK (booking_status IN ('TRUE', 'FALSE')),
    estimated_cost DECIMAL(10,2),
    call_type TEXT,

    transcript TEXT,
    recording_url TEXT,

    elevenlabs_agent_id TEXT,

    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calls_conversation ON calls(conversation_id);
CREATE INDEX IF NOT EXISTS idx_calls_entry ON calls(call_entry_id);

-- ============================================================
-- UPLOAD VALIDATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS upload_validations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES users(id),
    original_filename TEXT NOT NULL,
    file_hash TEXT,
    total_rows INTEGER,
    valid_rows INTEGER,
    error_rows INTEGER,
    errors JSONB,
    warnings JSONB,
    validation_passed BOOLEAN NOT NULL,
    call_list_id UUID REFERENCES call_lists(id),
    created_at TIMESTAMPTZ DEFAULT now()
);
