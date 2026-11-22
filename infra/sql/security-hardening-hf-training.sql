-- HF TRAINING only (project ydaqsmrfuwhqwqojrxyr), never HPS.
-- Do not change existing workout policies, which enforce user_id=auth.uid().
-- Event-trigger helper runs as its creator; ordinary clients must not call it via RPC.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
