-- Daniel and Adam are managers. The agent reads this role on each message.
UPDATE public.employees
SET
  role = 'MANAGER',
  is_admin = true,
  access_level = 'owner',
  is_active = true
WHERE lower(username) IN ('daniel', 'daniels', 'adam')
   OR name IN ('דניאל', 'אדם');
