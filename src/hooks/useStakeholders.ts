import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Stakeholder {
  id: string;
  certification_id: string;
  role: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  notes: string | null;
  contact_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type StakeholderInput = Omit<Stakeholder, "id" | "created_at" | "updated_at" | "created_by">;

const TABLE = "certification_stakeholders";

export function useStakeholders(certificationId?: string) {
  return useQuery({
    queryKey: ["stakeholders", certificationId],
    enabled: !!certificationId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from(TABLE)
        .select("*")
        .eq("certification_id", certificationId)
        .order("role", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Stakeholder[];
    },
  });
}

export function useCreateStakeholder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: StakeholderInput) => {
      const user = (await supabase.auth.getUser()).data.user;
      const { data, error } = await (supabase as any)
        .from(TABLE)
        .insert({ ...input, created_by: user?.id ?? null })
        .select("*")
        .single();
      if (error) throw error;
      return data as Stakeholder;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["stakeholders", vars.certification_id] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}

export function useUpdateStakeholder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<StakeholderInput>) => {
      const { data, error } = await (supabase as any)
        .from(TABLE)
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as Stakeholder;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["stakeholders", data.certification_id] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}

export function useDeleteStakeholder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; certification_id: string }) => {
      const { error } = await (supabase as any).from(TABLE).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["stakeholders", vars.certification_id] });
    },
  });
}

export const STAKEHOLDER_ROLES = [
  "Client",
  "Owner",
  "General Contractor",
  "MEP Contractor",
  "MEP Designer",
  "Architect",
  "Structural Engineer",
  "Commissioning Authority",
  "Energy Modeler",
  "Sustainability Consultant",
  "Other",
] as const;
