
-- Project stakeholders / participants per certification
CREATE TABLE public.certification_stakeholders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certification_id UUID NOT NULL REFERENCES public.certifications(id) ON DELETE CASCADE,
  role TEXT NOT NULL,                  -- Client, GC, MEP Contractor, MEP Designer, Architect, Owner, CxA, Other
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  company_name TEXT,
  notes TEXT,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cert_stakeholders_cert ON public.certification_stakeholders(certification_id);
CREATE INDEX idx_cert_stakeholders_contact ON public.certification_stakeholders(contact_id);

ALTER TABLE public.certification_stakeholders ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user that can see the certification
CREATE POLICY "Stakeholders viewable by authenticated"
ON public.certification_stakeholders
FOR SELECT
TO authenticated
USING (true);

-- Write: admins or PMs assigned to the certification
CREATE POLICY "Admins or cert PMs can insert stakeholders"
ON public.certification_stakeholders
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin(auth.uid())
  OR public.is_cert_pm(certification_id, auth.uid())
);

CREATE POLICY "Admins or cert PMs can update stakeholders"
ON public.certification_stakeholders
FOR UPDATE
TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.is_cert_pm(certification_id, auth.uid())
);

CREATE POLICY "Admins or cert PMs can delete stakeholders"
ON public.certification_stakeholders
FOR DELETE
TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.is_cert_pm(certification_id, auth.uid())
);

CREATE TRIGGER trg_cert_stakeholders_updated_at
BEFORE UPDATE ON public.certification_stakeholders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Sync stakeholder into contacts directory (Client -> client, others -> supplier).
-- Matches by contact_id, otherwise by (kind, lower(company_name)).
CREATE OR REPLACE FUNCTION public.sync_stakeholder_to_contact()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind TEXT;
  v_contact_id UUID;
  v_company TEXT;
  v_full_name TEXT;
BEGIN
  v_kind := CASE WHEN lower(coalesce(NEW.role,'')) = 'client' THEN 'client' ELSE 'supplier' END;
  v_company := NULLIF(trim(coalesce(NEW.company_name, '')), '');
  v_full_name := NULLIF(trim(concat_ws(' ', NEW.first_name, NEW.last_name)), '');

  -- If neither company nor contact reference, skip sync
  IF NEW.contact_id IS NULL AND v_company IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.contact_id IS NOT NULL THEN
    UPDATE public.contacts
       SET email = COALESCE(NULLIF(NEW.email,''), email),
           phone = COALESCE(NULLIF(NEW.phone,''), phone),
           primary_contact_name = COALESCE(v_full_name, primary_contact_name),
           primary_contact_role = COALESCE(NULLIF(NEW.role,''), primary_contact_role),
           primary_contact_email = COALESCE(NULLIF(NEW.email,''), primary_contact_email),
           primary_contact_phone = COALESCE(NULLIF(NEW.phone,''), primary_contact_phone),
           updated_at = now()
     WHERE id = NEW.contact_id;
    RETURN NEW;
  END IF;

  -- Try to find an existing contact by company name + kind
  SELECT id INTO v_contact_id
  FROM public.contacts
  WHERE kind = v_kind AND lower(company_name) = lower(v_company)
  LIMIT 1;

  IF v_contact_id IS NULL THEN
    INSERT INTO public.contacts (
      kind, company_name, email, phone,
      primary_contact_name, primary_contact_role,
      primary_contact_email, primary_contact_phone,
      created_by
    ) VALUES (
      v_kind, v_company,
      NULLIF(NEW.email,''), NULLIF(NEW.phone,''),
      v_full_name, NULLIF(NEW.role,''),
      NULLIF(NEW.email,''), NULLIF(NEW.phone,''),
      NEW.created_by
    )
    RETURNING id INTO v_contact_id;
  ELSE
    UPDATE public.contacts
       SET email = COALESCE(email, NULLIF(NEW.email,'')),
           phone = COALESCE(phone, NULLIF(NEW.phone,'')),
           primary_contact_name = COALESCE(primary_contact_name, v_full_name),
           primary_contact_role = COALESCE(primary_contact_role, NULLIF(NEW.role,'')),
           primary_contact_email = COALESCE(primary_contact_email, NULLIF(NEW.email,'')),
           primary_contact_phone = COALESCE(primary_contact_phone, NULLIF(NEW.phone,'')),
           updated_at = now()
     WHERE id = v_contact_id;
  END IF;

  NEW.contact_id := v_contact_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_stakeholder_sync_contact
BEFORE INSERT OR UPDATE ON public.certification_stakeholders
FOR EACH ROW EXECUTE FUNCTION public.sync_stakeholder_to_contact();
