-- ==============================================================================
-- CFM Quote Tool - Supabase Database Schema
-- ==============================================================================
-- Run this script in your Supabase SQL Editor:
-- Dashboard -> SQL Editor -> New query -> Paste and run.
-- ==============================================================================

-- 1. Create the quotes table
CREATE TABLE IF NOT EXISTS public.quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    quote_number TEXT NOT NULL,
    customer_name TEXT,
    account_number TEXT,
    contact_name TEXT,
    contact_phone TEXT,
    quote_date DATE,
    expiration_date DATE,
    po_number TEXT,
    quoted_by TEXT,
    quoted_by_email TEXT,
    freight NUMERIC(12, 2) DEFAULT 0,
    subtotal NUMERIC(12, 2) DEFAULT 0,
    total NUMERIC(12, 2) DEFAULT 0,
    -- items stores the table rows in display order:
    -- [{ type: 'item', lead_time, qty, model, description, cost, markup, amount },
    --  { type: 'note', text },
    --  { type: 'subtotal', label, amount }]
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- general notes array: ['note 1', 'note 2']
    notes JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Indexes for fast querying & sorting
CREATE INDEX IF NOT EXISTS idx_quotes_user_id ON public.quotes(user_id);
CREATE INDEX IF NOT EXISTS idx_quotes_quote_number ON public.quotes(quote_number);
CREATE INDEX IF NOT EXISTS idx_quotes_customer_name ON public.quotes(customer_name);
CREATE INDEX IF NOT EXISTS idx_quotes_updated_at ON public.quotes(updated_at DESC);

-- 3. Trigger to keep updated_at refreshed on every edit
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_quotes_updated_at ON public.quotes;
CREATE TRIGGER set_quotes_updated_at
    BEFORE UPDATE ON public.quotes
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

-- 5. Strict RLS Policies - users can ONLY see, create, update, and delete their own quotes
-- Using (select auth.uid()) optimizes query plans in Postgres
DROP POLICY IF EXISTS "Users can view own quotes" ON public.quotes;
CREATE POLICY "Users can view own quotes"
    ON public.quotes
    FOR SELECT
    USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own quotes" ON public.quotes;
CREATE POLICY "Users can insert own quotes"
    ON public.quotes
    FOR INSERT
    WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own quotes" ON public.quotes;
CREATE POLICY "Users can update own quotes"
    ON public.quotes
    FOR UPDATE
    USING ((select auth.uid()) = user_id)
    WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own quotes" ON public.quotes;
CREATE POLICY "Users can delete own quotes"
    ON public.quotes
    FOR DELETE
    USING ((select auth.uid()) = user_id);

-- Optional: Comments for documentation
COMMENT ON TABLE public.quotes IS 'Quotes saved by CFM quote tool users';
COMMENT ON COLUMN public.quotes.items IS 'JSON array of line items, section notes, and subtotals';
COMMENT ON COLUMN public.quotes.notes IS 'JSON array of general quote notes';
