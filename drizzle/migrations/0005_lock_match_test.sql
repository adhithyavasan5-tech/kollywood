REVOKE ALL ON public._match_test FROM anon, authenticated;
ALTER TABLE public._match_test ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public._match_test IS 'DEPRECATED: one-off test output, unused by the app';