
-- ============================================================
-- 1. SCHEMA
-- ============================================================
DROP TABLE IF EXISTS public.site_air_records CASCADE;

CREATE TABLE public.site_air_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL UNIQUE REFERENCES public.sites(id) ON DELETE CASCADE,
  certification_id uuid REFERENCES public.certifications(id) ON DELETE SET NULL,
  pm_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  
  project_name text NOT NULL,
  status text NOT NULL DEFAULT 'Upcoming',
  online_status text,
  notes text,

  total_sensors integer DEFAULT 0,
  
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.site_air_records ADD COLUMN IF NOT EXISTS po_numbers text[] DEFAULT '{}'::text[];

CREATE INDEX idx_site_air_records_site_id ON public.site_air_records(site_id);

-- ============================================================
-- 2. updated_at TRIGGER FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_site_air_records_updated_at
  BEFORE UPDATE ON public.site_air_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 3. RECALCULATION ENGINE (O(1) Site-Specific)
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_recalculate_site_air(p_site_id uuid)
RETURNS void AS $$
DECLARE
  v_sensor_count integer;
  v_po_numbers text[];
  v_summarized_status text;
  v_project_name text;
  v_pm_id uuid;
  v_cert_id uuid;
BEGIN
  IF p_site_id IS NULL THEN RETURN; END IF;

  -- Hardware aggregates (AIR only, assigned)
  SELECT 
    COUNT(*),
    ARRAY_AGG(DISTINCT opo.po_number) FILTER (WHERE opo.po_number IS NOT NULL)
  INTO v_sensor_count, v_po_numbers
  FROM public.hardwares h
  LEFT JOIN public.ops_purchase_orders opo ON opo.id = h.purchase_order_id
  WHERE h.site_id = p_site_id 
    AND h.category ILIKE '%AIR%'
    AND h.status != 'In Stock';

  -- If no AIR hardware left, delete and exit
  IF COALESCE(v_sensor_count, 0) = 0 THEN
    DELETE FROM public.site_air_records WHERE site_id = p_site_id;
    RETURN;
  END IF;

  -- Status: Movements -> Shipments (Outbound only)
  SELECT string_agg(cnt || ' ' || ship_status, ', ' ORDER BY ship_status)
  INTO v_summarized_status
  FROM (
    SELECT sh.status AS ship_status, COUNT(*) AS cnt
    FROM public.hardwares h2
    JOIN public.ops_hardware_movements hm ON h2.id = hm.hardware_id
    JOIN public.ops_shipments sh ON hm.shipment_id = sh.id
    WHERE h2.site_id = p_site_id 
      AND h2.category ILIKE '%AIR%'
      AND h2.status != 'In Stock'
      AND sh.shipment_type ILIKE 'Outbound'
    GROUP BY sh.status
  ) status_counts;

  -- Metadata
  SELECT s.name INTO v_project_name FROM public.sites s WHERE s.id = p_site_id;

  -- PM & Cert: latest certification
  SELECT c.id, c.pm_id
  INTO v_cert_id, v_pm_id
  FROM public.certifications c
  WHERE c.site_id = p_site_id
  ORDER BY c.created_at DESC
  LIMIT 1;

  -- Fallback to site_energy_records if no cert PM
  IF v_pm_id IS NULL THEN
    SELECT ser.pm_id INTO v_pm_id
    FROM public.site_energy_records ser
    WHERE ser.site_id = p_site_id
    ORDER BY ser.created_at DESC
    LIMIT 1;
  END IF;

  -- UPSERT
  INSERT INTO public.site_air_records (
    site_id, certification_id, pm_id, project_name, status,
    total_sensors, po_numbers, updated_at
  )
  VALUES (
    p_site_id, v_cert_id, v_pm_id, v_project_name,
    COALESCE(v_summarized_status, 'Assigned'),
    v_sensor_count, COALESCE(v_po_numbers, '{}'::text[]), now()
  )
  ON CONFLICT (site_id) DO UPDATE SET
    certification_id = EXCLUDED.certification_id,
    pm_id            = EXCLUDED.pm_id,
    project_name     = EXCLUDED.project_name,
    status           = EXCLUDED.status,
    total_sensors    = EXCLUDED.total_sensors,
    po_numbers       = EXCLUDED.po_numbers,
    updated_at       = now();
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 4. TRIGGER FUNCTIONS
-- ============================================================

-- A) HARDWARES
CREATE OR REPLACE FUNCTION public.trg_air_hw()
RETURNS TRIGGER AS $$
DECLARE
  v_old_site uuid;
  v_new_site uuid;
BEGIN
  v_old_site := OLD.site_id;
  v_new_site := NEW.site_id;

  IF TG_OP = 'DELETE' THEN
    IF OLD.category ILIKE '%AIR%' AND v_old_site IS NOT NULL THEN
      PERFORM public.fn_recalculate_site_air(v_old_site);
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.category ILIKE '%AIR%' AND v_new_site IS NOT NULL THEN
    PERFORM public.fn_recalculate_site_air(v_new_site);
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF v_old_site IS DISTINCT FROM v_new_site OR
       (OLD.category ILIKE '%AIR%' AND NEW.category NOT ILIKE '%AIR%') THEN
      IF v_old_site IS NOT NULL THEN
        PERFORM public.fn_recalculate_site_air(v_old_site);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- B) OPS_HARDWARE_MOVEMENTS
CREATE OR REPLACE FUNCTION public.trg_air_movement()
RETURNS TRIGGER AS $$
DECLARE
  v_hw_id uuid;
BEGIN
  v_hw_id := COALESCE(NEW.hardware_id, OLD.hardware_id);

  PERFORM public.fn_recalculate_site_air(h.site_id)
  FROM public.hardwares h
  WHERE h.id = v_hw_id
    AND h.category ILIKE '%AIR%'
    AND h.site_id IS NOT NULL;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- C) OPS_SHIPMENTS
CREATE OR REPLACE FUNCTION public.trg_air_shipment()
RETURNS TRIGGER AS $$
DECLARE
  r record;
BEGIN
  IF TG_OP = 'UPDATE' 
     AND NEW.status IS NOT DISTINCT FROM OLD.status 
     AND NEW.shipment_type IS NOT DISTINCT FROM OLD.shipment_type THEN
    RETURN NEW;
  END IF;

  FOR r IN
    SELECT DISTINCT h.site_id
    FROM public.hardwares h
    JOIN public.ops_hardware_movements hm ON hm.hardware_id = h.id
    WHERE hm.shipment_id = COALESCE(NEW.id, OLD.id)
      AND h.category ILIKE '%AIR%'
      AND h.site_id IS NOT NULL
  LOOP
    PERFORM public.fn_recalculate_site_air(r.site_id);
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- D) CERTIFICATIONS
CREATE OR REPLACE FUNCTION public.trg_air_cert()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.fn_recalculate_site_air(COALESCE(NEW.site_id, OLD.site_id));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- E) SITE_ENERGY_RECORDS
CREATE OR REPLACE FUNCTION public.trg_air_ser()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.fn_recalculate_site_air(COALESCE(NEW.site_id, OLD.site_id));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- F) SITES
CREATE OR REPLACE FUNCTION public.trg_air_site()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.name IS DISTINCT FROM NEW.name THEN
    PERFORM public.fn_recalculate_site_air(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- G) OPS_PURCHASE_ORDERS
CREATE OR REPLACE FUNCTION public.trg_air_po()
RETURNS TRIGGER AS $$
DECLARE
  r record;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.po_number IS NOT DISTINCT FROM OLD.po_number THEN
    RETURN NEW;
  END IF;

  FOR r IN
    SELECT DISTINCT h.site_id
    FROM public.hardwares h
    WHERE h.purchase_order_id = COALESCE(NEW.id, OLD.id)
      AND h.category ILIKE '%AIR%'
      AND h.site_id IS NOT NULL
  LOOP
    PERFORM public.fn_recalculate_site_air(r.site_id);
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 5. ATTACH TRIGGERS
-- ============================================================
DROP TRIGGER IF EXISTS trg_refresh_air_on_hardware ON public.hardwares;
CREATE TRIGGER trg_refresh_air_on_hardware
  AFTER INSERT OR UPDATE OR DELETE ON public.hardwares
  FOR EACH ROW EXECUTE FUNCTION public.trg_air_hw();

DROP TRIGGER IF EXISTS trg_refresh_air_on_movements ON public.ops_hardware_movements;
CREATE TRIGGER trg_refresh_air_on_movements
  AFTER INSERT OR UPDATE OR DELETE ON public.ops_hardware_movements
  FOR EACH ROW EXECUTE FUNCTION public.trg_air_movement();

DROP TRIGGER IF EXISTS trg_refresh_air_on_shipments ON public.ops_shipments;
CREATE TRIGGER trg_refresh_air_on_shipments
  AFTER INSERT OR UPDATE OR DELETE ON public.ops_shipments
  FOR EACH ROW EXECUTE FUNCTION public.trg_air_shipment();

DROP TRIGGER IF EXISTS trg_refresh_air_on_certs ON public.certifications;
CREATE TRIGGER trg_refresh_air_on_certs
  AFTER INSERT OR UPDATE OR DELETE ON public.certifications
  FOR EACH ROW EXECUTE FUNCTION public.trg_air_cert();

DROP TRIGGER IF EXISTS trg_refresh_air_on_ser ON public.site_energy_records;
CREATE TRIGGER trg_refresh_air_on_ser
  AFTER INSERT OR UPDATE OR DELETE ON public.site_energy_records
  FOR EACH ROW EXECUTE FUNCTION public.trg_air_ser();

DROP TRIGGER IF EXISTS trg_refresh_air_on_sites ON public.sites;
CREATE TRIGGER trg_refresh_air_on_sites
  AFTER UPDATE ON public.sites
  FOR EACH ROW EXECUTE FUNCTION public.trg_air_site();

DROP TRIGGER IF EXISTS trg_refresh_air_on_po ON public.ops_purchase_orders;
CREATE TRIGGER trg_refresh_air_on_po
  AFTER UPDATE ON public.ops_purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_air_po();

-- ============================================================
-- 6. RLS
-- ============================================================
ALTER TABLE public.site_air_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access"
  ON public.site_air_records FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "PMs read their projects"
  ON public.site_air_records FOR SELECT TO authenticated
  USING (pm_id = auth.uid() OR public.is_admin(auth.uid()));

-- ============================================================
-- 7. SEED
-- ============================================================
DO $$ 
DECLARE 
  r RECORD;
BEGIN
  FOR r IN (
    SELECT DISTINCT site_id 
    FROM public.hardwares 
    WHERE category ILIKE '%AIR%' 
      AND status != 'In Stock'
      AND site_id IS NOT NULL
  ) LOOP
    PERFORM public.fn_recalculate_site_air(r.site_id);
  END LOOP;
END $$;
