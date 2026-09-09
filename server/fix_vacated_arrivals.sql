UPDATE hotelos_bookings
SET booking_status = 'CONFIRMED',
    updated_at = now()
WHERE deleted_at IS NULL
  AND booking_status = 'CHECKED_OUT'
  AND check_in_date >= '2026-09-02'
  AND check_out_date > check_in_date;
