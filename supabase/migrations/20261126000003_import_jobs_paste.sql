-- Pasted text has no URL (M5, doc §6 step 5). A link import still needs one.
alter table import_jobs alter column url drop not null;
alter table import_jobs add constraint import_jobs_url_unless_paste
  check (method = 'paste' or url is not null);
