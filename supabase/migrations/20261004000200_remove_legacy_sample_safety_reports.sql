begin;

-- These rows predate phone-based reporting and are sample fixture content.
-- Real reports submitted by the Aasai Talk app always have reporter_phone.
delete from public.safety_reports
where reporter_phone is null;

commit;
