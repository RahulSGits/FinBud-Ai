-- Row Level Security: the database refuses cross-tenant rows, rather than
-- trusting every query to remember a filter.
--
-- WHY A GUC AND NOT auth.uid()
-- Supabase's usual policy helpers read a Supabase Auth JWT. This app does not
-- use Supabase Auth — it issues its own HS256 cookie — so there is no such JWT
-- at the database. The tenant is instead carried in a session variable that the
-- application sets inside the transaction it is about to query in:
--
--     SET LOCAL app.company_id = '<uuid>';
--
-- SET LOCAL, not SET: it is scoped to the transaction, so a pooled connection
-- handed to the next request cannot inherit the previous tenant. That is the
-- property that makes this safe under PgBouncer transaction pooling, which is
-- exactly how this app connects.
--
-- FAIL CLOSED
-- current_setting(..., true) returns NULL when unset, and every policy below
-- compares against it. A connection that has not declared a tenant therefore
-- matches no rows at all. Forgetting to set the context loses data visibility —
-- it never widens it.
--
-- WHAT THIS DOES AND DOES NOT PROTECT TODAY
-- The application currently connects as `postgres`, which carries BYPASSRLS on
-- Supabase, so these policies do not constrain it — the app's own scoping in
-- lib/authz.ts remains the enforcement for that path, with 16 tests behind it.
-- What this DOES protect is every other route to the data: PostgREST, the
-- Supabase client, psql as a normal role, and any future role. Pointing the app
-- at a NOBYPASSRLS role is the follow-up step, and these policies are its
-- precondition.
--
-- ALSO FORCE
-- ENABLE alone still exempts the table owner. FORCE removes that exemption, so
-- ownership stops being an accidental bypass.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- The tenant declared for this transaction, or NULL.
CREATE OR REPLACE FUNCTION app_company_id() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.company_id', true), '');
$$;

-- The platform owner, who is deliberately allowed across tenants. Separate from
-- the tenant setting so that "no tenant" and "super admin" can never be
-- confused: an unset context is not elevated access.
CREATE OR REPLACE FUNCTION app_is_super_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('app.is_super_admin', true), '') = 'true';
$$;

-- ---------------------------------------------------------------------------
-- Tenant-owned tables: visible when the row's company matches the transaction's
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'CompanySetting','User','Invite','Agent','Contact','Campaign','Call',
    'Note','Document','MessageTemplate','Message','CallFinding',
    'Subscription','Invoice','Payment','Refund'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING ("companyId" = app_company_id() OR app_is_super_admin())
        WITH CHECK ("companyId" = app_company_id() OR app_is_super_admin())
    $f$, t);
  END LOOP;
END $$;

-- AuditLog is the deliberate exception: platform-owner actions legitimately
-- have no company, so a NULL companyId row is readable only by a super admin
-- rather than by everyone or no one.
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AuditLog";
CREATE POLICY tenant_isolation ON "AuditLog"
  USING (("companyId" IS NOT NULL AND "companyId" = app_company_id()) OR app_is_super_admin())
  WITH CHECK (("companyId" IS NOT NULL AND "companyId" = app_company_id()) OR app_is_super_admin());

-- ---------------------------------------------------------------------------
-- The tenant itself
-- ---------------------------------------------------------------------------
ALTER TABLE "Company" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Company" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Company";
CREATE POLICY tenant_isolation ON "Company"
  USING (id = app_company_id() OR app_is_super_admin())
  WITH CHECK (app_is_super_admin());   -- only the platform owner creates or edits companies

-- ---------------------------------------------------------------------------
-- Rows that inherit their tenant through a parent
--
-- Written as EXISTS against the parent rather than by denormalising companyId
-- onto the child: the parent's own policy then applies too, so the rule cannot
-- drift from its owner's.
-- ---------------------------------------------------------------------------
ALTER TABLE "DocumentChunk" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentChunk" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "DocumentChunk";
CREATE POLICY tenant_isolation ON "DocumentChunk"
  USING (EXISTS (SELECT 1 FROM "Document" d WHERE d.id = "documentId"
                 AND (d."companyId" = app_company_id() OR app_is_super_admin())))
  WITH CHECK (EXISTS (SELECT 1 FROM "Document" d WHERE d.id = "documentId"
                 AND (d."companyId" = app_company_id() OR app_is_super_admin())));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['InvoiceItem','PaymentReminder'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (EXISTS (SELECT 1 FROM "Invoice" i WHERE i.id = "invoiceId"
               AND (i."companyId" = app_company_id() OR app_is_super_admin())))
        WITH CHECK (EXISTS (SELECT 1 FROM "Invoice" i WHERE i.id = "invoiceId"
               AND (i."companyId" = app_company_id() OR app_is_super_admin())))
    $f$, t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Platform-wide tables
-- ---------------------------------------------------------------------------

-- The plan catalogue is public to signed-in tenants (they must see what they
-- can buy) but only the platform owner may change it.
ALTER TABLE "Plan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Plan" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS plan_read ON "Plan";
DROP POLICY IF EXISTS plan_write ON "Plan";
CREATE POLICY plan_read  ON "Plan" FOR SELECT USING (true);
CREATE POLICY plan_write ON "Plan" USING (app_is_super_admin()) WITH CHECK (app_is_super_admin());

-- Platform settings and the raw gateway event log are the owner's alone.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Setting','BillingEvent'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS platform_only ON %I', t);
    EXECUTE format('CREATE POLICY platform_only ON %I USING (app_is_super_admin()) WITH CHECK (app_is_super_admin())', t);
  END LOOP;
END $$;
