-- The unit the oven temperature was entered in, so it's shown as entered (doc §3.10).
-- oven_temp_c stays the canonical value; null = unknown (recipes saved before this).
alter table recipes add column oven_temp_unit text
  check (oven_temp_unit in ('F', 'C'));
alter table recipes add constraint recipes_oven_unit_needs_temp
  check (oven_temp_unit is null or oven_temp_c is not null);
