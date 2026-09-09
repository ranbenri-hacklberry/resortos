-- Prevent two live stays on the same unit from overlapping.
-- daterange '[)' matches bookingOverlap.staysOverlap: checkout day is free for the next arrival.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.hotelos_bookings
  DROP CONSTRAINT IF EXISTS hotelos_bookings_unit_dates_excl;

ALTER TABLE public.hotelos_bookings
  ADD CONSTRAINT hotelos_bookings_unit_dates_excl
  EXCLUDE USING gist (
    unit_id WITH =,
    daterange(check_in_date, check_out_date, '[)') WITH &&
  )
  WHERE (
    deleted_at IS NULL
    AND booking_status IS DISTINCT FROM 'CANCELED'
    AND booking_status IS DISTINCT FROM 'CHECKED_OUT'
  );
