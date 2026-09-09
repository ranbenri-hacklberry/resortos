SELECT id, guest_name, unit_id, check_in_date, check_out_date, booking_status, updated_at
FROM hotelos_bookings
WHERE deleted_at IS NULL
  AND booking_status = 'CHECKED_OUT'
  AND check_in_date >= '2026-09-01'
ORDER BY check_in_date, guest_name
LIMIT 40;
