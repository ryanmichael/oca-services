-- Phase 2 leftover — short-form hierarch fields for litany derivation.
-- See docs/parish-self-service-design.md §2.4 (derivation templates).
--
-- The Anaphora hierarch commemoration uses the full title; the Great and
-- Augmented litanies (and Vespers Litya) use a short form like
-- "Metropolitan Tikhon" / "Archbishop Alexander". These columns capture
-- that short form so the derivation template can generate every hierarch-
-- referencing overlay key from form fields alone.

BEGIN TRANSACTION;

ALTER TABLE parish_settings ADD COLUMN primate_short         TEXT;
ALTER TABLE parish_settings ADD COLUMN ruling_hierarch_short TEXT;

COMMIT;
