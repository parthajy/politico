-- Field network — part 1 of 2: enum additions only.
-- ALTER TYPE ADD VALUE has to commit before the new value can be used in code,
-- so the table + RLS + function changes live in 0009_field_network_part2.sql.

alter type user_role add value if not exists 'firm_intern';
alter type user_role add value if not exists 'volunteer';
