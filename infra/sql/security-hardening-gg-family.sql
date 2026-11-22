-- GG FAMILY only (project xnvnlmmwfpdlkolukhyh), never HPS.
-- Security-only change: no row mutation. Existing owner's update policy remains.
-- Old policy gg_workouts_update_live had USING (deleted_at IS NULL) and WITH CHECK true,
-- which could combine permissively with owner update policy. Remove that bypass.
DROP POLICY IF EXISTS gg_workouts_update_live ON public.workouts;
-- Event-trigger helper runs as its creator; ordinary clients must not call it via RPC.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
