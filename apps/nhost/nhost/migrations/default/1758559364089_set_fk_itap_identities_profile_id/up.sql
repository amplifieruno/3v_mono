alter table "itap"."identities"
  add constraint "identities_profile_id_fkey"
  foreign key ("profile_id")
  references "itap"."profiles"
  ("id") on update restrict on delete restrict;
