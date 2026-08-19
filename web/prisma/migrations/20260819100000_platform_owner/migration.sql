-- The platform owner belongs to no company; everyone else must belong to one.
--
-- User.companyId becomes nullable so a super_admin can exist at all. On its own
-- that would reopen the hole the previous migration closed — a create that
-- forgets the tenant producing a row invisible to every scope — so the rule is
-- restated as a constraint the database enforces on every insert and update,
-- rather than a nullability the type system can no longer express.
ALTER TABLE "User" ALTER COLUMN "companyId" DROP NOT NULL;

ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "user_company_matches_role";
ALTER TABLE "User" ADD CONSTRAINT "user_company_matches_role" CHECK (
  (role = 'super_admin' AND "companyId" IS NULL)
  OR
  (role <> 'super_admin' AND "companyId" IS NOT NULL)
);
