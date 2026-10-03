CREATE TABLE IF NOT EXISTS public.app_private_config (name text PRIMARY KEY, value text NOT NULL);
GRANT ALL ON public.app_private_config TO service_role;
ALTER TABLE public.app_private_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_private_config FROM anon, authenticated;