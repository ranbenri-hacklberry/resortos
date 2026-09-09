SELECT
  b.unit_id,
  COALESCE(u.name, b.unit_id) AS unit_name,
  b.guest_name,
  b.check_in_date,
  b.check_out_date,
  b.booking_status
FROM hotelos_bookings b
LEFT JOIN unit_operations u ON u.id = b.unit_id
WHERE b.deleted_at IS NULL
  AND b.booking_status IS DISTINCT FROM 'CANCELED'
  AND b.check_out_date = '2026-09-02'
ORDER BY unit_name, guest_name;

SELECT id, name, operational_status, custom_reason
FROM unit_operations
WHERE operational_status IN ('DIRTY', 'IN_PROGRESS')
ORDER BY name;
