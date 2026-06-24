
-- Rename existing enum values to match new HR availability taxonomy
ALTER TYPE public.hr_availability_status RENAME VALUE 'available' TO 'office';
ALTER TYPE public.hr_availability_status RENAME VALUE 'busy' TO 'unavailable';
ALTER TYPE public.hr_availability_status RENAME VALUE 'off' TO 'vacation';
ALTER TYPE public.hr_availability_status RENAME VALUE 'remote' TO 'smart_working';
-- Add new values
ALTER TYPE public.hr_availability_status ADD VALUE IF NOT EXISTS 'permit';
ALTER TYPE public.hr_availability_status ADD VALUE IF NOT EXISTS 'sick';

-- Update default
ALTER TABLE public.hr_availability ALTER COLUMN status SET DEFAULT 'office';

-- Update approval trigger to use new values + map permit/sick correctly
CREATE OR REPLACE FUNCTION public.hr_apply_approved_request()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d date;
BEGIN
  IF NEW.status = 'approved'
     AND (OLD.status IS DISTINCT FROM 'approved')
     AND NEW.type IN ('holiday','permit','travel') THEN
    d := NEW.start_date;
    WHILE d <= NEW.end_date LOOP
      INSERT INTO public.hr_availability (user_id, date, status, note)
      VALUES (
        NEW.user_id,
        d,
        CASE
          WHEN NEW.type = 'travel'  THEN 'travel'::public.hr_availability_status
          WHEN NEW.type = 'permit'  THEN 'permit'::public.hr_availability_status
          ELSE 'vacation'::public.hr_availability_status
        END,
        COALESCE(NEW.reason, NEW.type::text)
      )
      ON CONFLICT (user_id, date) DO UPDATE
        SET status = EXCLUDED.status,
            note   = EXCLUDED.note,
            updated_at = now();
      d := d + 1;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
