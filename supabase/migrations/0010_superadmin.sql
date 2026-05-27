-- Superadmin role: the user-management + system-oversight tier.
-- One person (Partha) holds this at the start; can create more superadmins.

alter type user_role add value if not exists 'superadmin';
