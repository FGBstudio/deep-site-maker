import { useMemo, useState } from "react";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Mail, Phone, Building2, Pencil, Trash2, UserRound, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  STAKEHOLDER_ROLES,
  Stakeholder,
  useCreateStakeholder,
  useDeleteStakeholder,
  useStakeholders,
  useUpdateStakeholder,
} from "@/hooks/useStakeholders";

const Schema = z
  .object({
    role: z.string().trim().min(1, "Role required").max(100),
    first_name: z.string().trim().max(100).optional().or(z.literal("")),
    last_name: z.string().trim().max(100).optional().or(z.literal("")),
    company_name: z.string().trim().max(200).optional().or(z.literal("")),
    email: z.string().trim().email("Invalid email").max(255).optional().or(z.literal("")),
    phone: z.string().trim().max(50).optional().or(z.literal("")),
    notes: z.string().trim().max(1000).optional().or(z.literal("")),
  })
  .refine((d) => !!(d.email || d.phone), {
    message: "Provide at least an email or a phone number",
    path: ["email"],
  });

interface Props {
  certificationId: string;
}

const emptyForm = () => ({
  role: "Client",
  first_name: "",
  last_name: "",
  company_name: "",
  email: "",
  phone: "",
  notes: "",
});

export function StakeholdersPanel({ certificationId }: Props) {
  const { toast } = useToast();
  const { data: stakeholders = [], isLoading } = useStakeholders(certificationId);
  const create = useCreateStakeholder();
  const update = useUpdateStakeholder();
  const remove = useDeleteStakeholder();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Stakeholder | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Stakeholder | null>(null);
  const [form, setForm] = useState<Record<string, string>>(emptyForm());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const grouped = useMemo(() => {
    const g: Record<string, Stakeholder[]> = {};
    stakeholders.forEach((s) => {
      const key = s.role || "Other";
      if (!g[key]) g[key] = [];
      g[key].push(s);
    });
    return g;
  }, [stakeholders]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setErrors({});
    setOpen(true);
  };

  const openEdit = (s: Stakeholder) => {
    setEditing(s);
    setForm({
      role: s.role,
      first_name: s.first_name ?? "",
      last_name: s.last_name ?? "",
      company_name: s.company_name ?? "",
      email: s.email ?? "",
      phone: s.phone ?? "",
      notes: s.notes ?? "",
    });
    setErrors({});
    setOpen(true);
  };

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    const parsed = Schema.safeParse(form);
    if (!parsed.success) {
      const map: Record<string, string> = {};
      parsed.error.issues.forEach((i) => (map[i.path.join(".")] = i.message));
      setErrors(map);
      return;
    }
    setErrors({});
    const toNull = (v?: string) => (v && v.trim() ? v.trim() : null);
    const payload = {
      certification_id: certificationId,
      role: parsed.data.role,
      first_name: toNull(parsed.data.first_name),
      last_name: toNull(parsed.data.last_name),
      company_name: toNull(parsed.data.company_name),
      email: toNull(parsed.data.email),
      phone: toNull(parsed.data.phone),
      notes: toNull(parsed.data.notes),
      contact_id: editing?.contact_id ?? null,
    };
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, ...payload });
        toast({ title: "Stakeholder updated" });
      } else {
        await create.mutateAsync(payload);
        toast({ title: "Stakeholder added", description: "Synced to Contacts directory." });
      }
      setOpen(false);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Save failed";
      toast({ variant: "destructive", title: "Save failed", description: message });
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await remove.mutateAsync({ id: confirmDelete.id, certification_id: certificationId });
      toast({ title: "Stakeholder removed" });
      setConfirmDelete(null);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Delete failed";
      toast({ variant: "destructive", title: "Delete failed", description: message });
    }
  };

  const saving = create.isPending || update.isPending;

  return (
    <Card className="rounded-3xl border-border/60 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Project Stakeholders</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Client, contractors and designers involved in this project. Saved entries also appear in the Contacts directory.
          </p>
        </div>
        <Button size="sm" onClick={openCreate} className="rounded-full">
          <Plus className="h-4 w-4 mr-1.5" /> Add stakeholder
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground text-sm">Loading…</div>
        ) : stakeholders.length === 0 ? (
          <div className="py-12 text-center">
            <UserRound className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No stakeholders yet.</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Add the Client, GC, MEP Contractor and other key actors.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([role, items]) => (
              <section key={role}>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{role}</h3>
                  <Badge variant="secondary" className="text-[10px] h-4">{items.length}</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {items.map((s) => {
                    const full = [s.first_name, s.last_name].filter(Boolean).join(" ");
                    return (
                      <div
                        key={s.id}
                        className="group rounded-2xl border border-border/60 p-4 bg-card hover:shadow-sm transition-all"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">{full || s.company_name || "—"}</p>
                            {s.company_name && full && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <Building2 className="h-3 w-3" />
                                <span className="truncate">{s.company_name}</span>
                              </p>
                            )}
                          </div>
                          <div className="opacity-0 group-hover:opacity-100 transition flex gap-1 shrink-0">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => setConfirmDelete(s)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        <div className="mt-3 space-y-1.5">
                          {s.email && (
                            <a
                              href={`mailto:${s.email}`}
                              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5"
                            >
                              <Mail className="h-3 w-3" /> {s.email}
                            </a>
                          )}
                          {s.phone && (
                            <a
                              href={`tel:${s.phone}`}
                              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5"
                            >
                              <Phone className="h-3 w-3" /> {s.phone}
                            </a>
                          )}
                          {s.notes && (
                            <p className="text-xs text-muted-foreground/80 italic pt-1 border-t border-border/40 mt-2">
                              {s.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </CardContent>

      {/* Form dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit stakeholder" : "Add stakeholder"}</DialogTitle>
            <DialogDescription>
              Will be synced to the <strong>Contacts</strong> directory (Clients or Suppliers based on role).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Role *</Label>
              <Select value={form.role} onValueChange={(v) => set("role", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAKEHOLDER_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>First name</Label>
                <Input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Last name</Label>
                <Input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Company</Label>
              <Input
                value={form.company_name}
                onChange={(e) => set("company_name", e.target.value)}
                placeholder="e.g. Acme Construction"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="name@example.com"
                />
                {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                maxLength={1000}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Internal notes about this contact"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove stakeholder?</AlertDialogTitle>
            <AlertDialogDescription>
              This only removes the link from this project. The contact in the directory is kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
