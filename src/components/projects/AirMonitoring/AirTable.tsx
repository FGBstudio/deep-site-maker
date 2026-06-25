import { useState, useMemo } from "react";
import { useAirRows, useAirDevices, type AirMonitorRow } from "@/hooks/useAirRows";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { 
  Download, Clock, Calendar, Package, 
  Loader2, User, Activity, Monitor,
  ArrowUp, ArrowDown, ArrowUpDown, Filter, Search, CheckCircle2
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog, DialogContent, DialogHeader, 
  DialogTitle, DialogTrigger 
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const getSelectStatus = (status: string | null): string => {
  if (!status) return 'Upcoming';
  const s = status.toLowerCase();
  if (/delivered|complete|installed/i.test(s)) return 'Delivered';
  if (/shipped|transit|assigned/i.test(s)) return 'Assigned';
  return 'Upcoming';
};

/* ─────────── Device Modal Content ─────────── */
const DeviceModalContent = ({ siteId, projectName }: { siteId: string, projectName: string }) => {
  const { data: devices, isLoading } = useAirDevices(siteId);

  if (isLoading) return (
    <div className="py-20 flex flex-col items-center gap-3 text-slate-400">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      <p className="text-sm font-medium">Loading inventory...</p>
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto p-1 pr-2">
      {devices?.map((device, idx) => (
        <div key={idx} className="flex flex-col gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200/60">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="text-[10px] font-mono bg-white text-indigo-700 border-indigo-100">
              {device.device_id || 'NO SERIAL'}
            </Badge>
            <span className="text-[10px] text-slate-400 font-mono">
              {device.mac_address || 'NO MAC'}
            </span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1">
            <div className="flex items-center gap-1">
              <Package className="w-3 h-3" /> {device.po_number || '—'}
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3" /> {device.shipment_date ? format(new Date(device.shipment_date), "MMM d, yy") : '—'}
            </div>
          </div>
        </div>
      ))}
      {!devices?.length && <p className="col-span-2 text-center py-10 text-slate-400 text-sm italic">No devices found.</p>}
    </div>
  );
};

/* ─────────── Excel Header Cell Helper functions ─────────── */
function getUniqueValues(colKey: string, rows: any[]): string[] {
  const values = new Set<string>();
  rows.forEach(r => {
    let val: any = '';
    if (colKey === 'project_name') val = r.project_name;
    else if (colKey === 'pm_name') val = r.pm_name || '(Blanks)';
    else if (colKey === 'total_sensors') val = String(r.total_sensors ?? 0);
    else if (colKey === 'po_numbers') {
      if (r.po_numbers && r.po_numbers.length > 0) {
        r.po_numbers.forEach((po: string) => values.add(po));
      } else {
        values.add('(Blanks)');
      }
      return;
    }
    else if (colKey === 'handover_date') {
      val = r.handover_date ? format(new Date(r.handover_date), "MMM d, yy") : '(Blanks)';
    }
    else if (colKey === 'latest_shipment_date') {
      val = r.latest_shipment_date ? format(new Date(r.latest_shipment_date), "MMM d, yy") : '(Blanks)';
    }
    else if (colKey === 'region') val = r.region || '(Blanks)';
    else if (colKey === 'country') val = r.country || '(Blanks)';
    else if (colKey === 'status') val = getSelectStatus(r.status);
    else if (colKey === 'notes') val = r.notes || '(Blanks)';
    else if (colKey === 'quotation_value') val = `€${(r.quotation_value ?? 0).toLocaleString()}`;
    else if (colKey === 'hardware_cost') val = `€${(r.hardware_cost ?? 0).toLocaleString()}`;
    else if (colKey === 'shipping') val = `€${((r.inbound_cost ?? 0) + (r.outbound_cost ?? 0) + (r.internal_cost ?? 0)).toLocaleString()}`;
    else if (colKey === 'vat_cost') val = `€${((r.customs_cost ?? 0) + (r.vat_cost ?? 0)).toLocaleString()}`;
    else if (colKey === 'profit') val = `€${(r.profit ?? 0).toLocaleString()}`;
    else if (colKey === 'roi') val = `${Math.round(r.roi ?? 0)}%`;
    
    if (val !== undefined && val !== null) {
      values.add(String(val));
    }
  });
  return Array.from(values).sort((a, b) => {
    if (a === '(Blanks)') return 1;
    if (b === '(Blanks)') return -1;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });
}

function matchRowValue(r: any, colKey: string, selectedValues: string[] | null | undefined): boolean {
  if (selectedValues === null || selectedValues === undefined) return true;
  
  let val: string = '';
  if (colKey === 'project_name') val = r.project_name;
  else if (colKey === 'pm_name') val = r.pm_name || '(Blanks)';
  else if (colKey === 'region') val = r.region || '(Blanks)';
  else if (colKey === 'country') val = r.country || '(Blanks)';
  else if (colKey === 'total_sensors') val = String(r.total_sensors ?? 0);
  else if (colKey === 'po_numbers') {
    if (r.po_numbers && r.po_numbers.length > 0) {
      return r.po_numbers.some((po: string) => selectedValues.includes(po));
    } else {
      return selectedValues.includes('(Blanks)');
    }
  }
  else if (colKey === 'handover_date') {
    val = r.handover_date ? format(new Date(r.handover_date), "MMM d, yy") : '(Blanks)';
  }
  else if (colKey === 'latest_shipment_date') {
    val = r.latest_shipment_date ? format(new Date(r.latest_shipment_date), "MMM d, yy") : '(Blanks)';
  }
  else if (colKey === 'status') val = getSelectStatus(r.status);
  else if (colKey === 'notes') val = r.notes || '(Blanks)';
  else if (colKey === 'quotation_value') val = `€${(r.quotation_value ?? 0).toLocaleString()}`;
  else if (colKey === 'hardware_cost') val = `€${(r.hardware_cost ?? 0).toLocaleString()}`;
  else if (colKey === 'shipping') val = `€${((r.inbound_cost ?? 0) + (r.outbound_cost ?? 0) + (r.internal_cost ?? 0)).toLocaleString()}`;
  else if (colKey === 'vat_cost') val = `€${((r.customs_cost ?? 0) + (r.vat_cost ?? 0)).toLocaleString()}`;
  else if (colKey === 'profit') val = `€${(r.profit ?? 0).toLocaleString()}`;
  else if (colKey === 'roi') val = `${Math.round(r.roi ?? 0)}%`;
  
  return selectedValues.includes(val);
}

/* ─────────── Excel Header Cell Component ─────────── */
function ExcelHeaderCell({
  title,
  colKey,
  rows,
  colFilters,
  setColFilters,
  sortConfig,
  setSortConfig,
  customContent,
  className
}: {
  title: string;
  colKey: string;
  rows: any[];
  colFilters: Record<string, { search: string; selectedValues: string[] | null | undefined }>;
  setColFilters: React.Dispatch<React.SetStateAction<Record<string, { search: string; selectedValues: string[] | null | undefined }>>>;
  sortConfig: { key: string; direction: 'asc' | 'desc' } | null;
  setSortConfig: React.Dispatch<React.SetStateAction<{ key: string; direction: 'asc' | 'desc' } | null>>;
  customContent?: React.ReactNode;
  className?: string;
}) {
  const [popoverSearch, setPopoverSearch] = useState("");
  
  const uniqueValues = useMemo(() => {
    return getUniqueValues(colKey, rows);
  }, [colKey, rows]);

  const columnFilter = colFilters[colKey] || { search: "", selectedValues: undefined };
  
  const filteredChecklist = useMemo(() => {
    return uniqueValues.filter(v => 
      v.toLowerCase().includes(popoverSearch.toLowerCase())
    );
  }, [uniqueValues, popoverSearch]);

  const isSortedAsc = sortConfig?.key === colKey && sortConfig?.direction === 'asc';
  const isSortedDesc = sortConfig?.key === colKey && sortConfig?.direction === 'desc';
  const isFiltered = columnFilter.selectedValues !== undefined && columnFilter.selectedValues !== null;

  const handleSort = (direction: 'asc' | 'desc') => {
    setSortConfig({ key: colKey, direction });
  };

  const handleSelectAll = (checked: boolean) => {
    setColFilters(prev => ({
      ...prev,
      [colKey]: {
        ...prev[colKey],
        selectedValues: checked ? undefined : []
      }
    }));
  };

  const handleValueToggle = (value: string, checked: boolean) => {
    setColFilters(prev => {
      const current = prev[colKey] || { search: "", selectedValues: undefined };
      let nextSelected: string[];
      
      if (current.selectedValues === undefined || current.selectedValues === null) {
        nextSelected = [...uniqueValues];
      } else {
        nextSelected = [...current.selectedValues];
      }

      if (checked) {
        if (!nextSelected.includes(value)) nextSelected.push(value);
      } else {
        nextSelected = nextSelected.filter(v => v !== value);
      }

      if (nextSelected.length === uniqueValues.length) {
        return {
          ...prev,
          [colKey]: {
            ...current,
            selectedValues: undefined
          }
        };
      }

      return {
        ...prev,
        [colKey]: {
          ...current,
          selectedValues: nextSelected
        }
      };
    });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={cn(
          "inline-flex items-center gap-1.5 hover:text-slate-800 transition-colors uppercase font-semibold text-[10px] tracking-wider py-1.5 select-none outline-none",
          (isSortedAsc || isSortedDesc || isFiltered) && "text-indigo-600 font-bold",
          className
        )}>
          <span>{title}</span>
          {isSortedAsc && <ArrowUp className="w-3 h-3 shrink-0" />}
          {isSortedDesc && <ArrowDown className="w-3 h-3 shrink-0" />}
          {!isSortedAsc && !isSortedDesc && <ArrowUpDown className="w-3 h-3 opacity-40 shrink-0 hover:opacity-100" />}
          {isFiltered && <Filter className="w-2.5 h-2.5 fill-indigo-600 shrink-0" />}
        </button>
      </PopoverTrigger>
      
      <PopoverContent className="w-56 p-2 bg-white border border-slate-200 shadow-xl rounded-xl z-50">
        <div className="space-y-1 text-xs">
          <button 
            onClick={() => handleSort('asc')}
            className={cn(
              "w-full text-left px-2 py-1.5 rounded-lg flex items-center gap-2 hover:bg-slate-50 transition-colors font-medium text-slate-700",
              isSortedAsc && "bg-indigo-50/50 text-indigo-700 font-bold"
            )}
          >
            <ArrowUp className="w-3.5 h-3.5" /> Sort A to Z
          </button>
          <button 
            onClick={() => handleSort('desc')}
            className={cn(
              "w-full text-left px-2 py-1.5 rounded-lg flex items-center gap-2 hover:bg-slate-50 transition-colors font-medium text-slate-700",
              isSortedDesc && "bg-indigo-50/50 text-indigo-700 font-bold"
            )}
          >
            <ArrowDown className="w-3.5 h-3.5" /> Sort Z to A
          </button>
          
          <div className="border-t border-slate-100 my-1.5" />
          
          <div className="relative px-1 mb-1.5">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <Input 
              value={popoverSearch} 
              onChange={e => setPopoverSearch(e.target.value)} 
              placeholder="Search values..." 
              className="pl-8 pr-2 h-7 text-xs bg-slate-50/50 border-slate-200 focus-visible:ring-indigo-500/20"
            />
          </div>

          <div className="max-h-48 overflow-y-auto px-1 space-y-1.5">
            <label className="flex items-center gap-2 px-1 py-0.5 hover:bg-slate-50 rounded cursor-pointer select-none">
              <Checkbox 
                checked={columnFilter.selectedValues === undefined || columnFilter.selectedValues === null} 
                onCheckedChange={(checked) => handleSelectAll(!!checked)}
              />
              <span className="font-semibold text-slate-700">(Select All)</span>
            </label>
            
            {filteredChecklist.map(val => {
              const isChecked = columnFilter.selectedValues === undefined || 
                                columnFilter.selectedValues === null || 
                                columnFilter.selectedValues.includes(val);
              return (
                <label key={val} className="flex items-center gap-2 px-1 py-0.5 hover:bg-slate-50 rounded cursor-pointer select-none truncate">
                  <Checkbox 
                    checked={isChecked} 
                    onCheckedChange={(checked) => handleValueToggle(val, !!checked)}
                  />
                  <span className="text-slate-600 truncate">{val}</span>
                </label>
              );
            })}
          </div>

          {customContent}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ─────────── Main Table ─────────── */
export function AirTable() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useAirRows();

  const [colFilters, setColFilters] = useState<Record<string, { search: string; selectedValues: string[] | null | undefined }>>({});
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [showFinancials, setShowFinancials] = useState(true);

  const uniques = useMemo(() => ({
    regions: Array.from(new Set(rows.map(r => r.region).filter(Boolean))).sort() as string[],
    countries: Array.from(new Set(rows.map(r => r.country).filter(Boolean))).sort() as string[],
  }), [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      for (const colKey of Object.keys(colFilters)) {
        const filter = colFilters[colKey];
        if (!filter) continue;

        // Fall through to generic matchRowValue filtering

        if (filter.search) {
          let val = '';
          if (colKey === 'project_name') val = `${r.project_name} ${r.city} ${r.country} ${r.region}`;
          else if (colKey === 'pm_name') val = r.pm_name || '';
          else if (colKey === 'total_sensors') val = String(r.total_sensors ?? 0);
          else if (colKey === 'po_numbers') val = r.po_numbers.join(" ");
          else if (colKey === 'status') val = r.status || '';
          else if (colKey === 'notes') val = r.notes || '';
          else if (colKey === 'handover_date') val = r.handover_date ? format(new Date(r.handover_date), "MMM d, yy") : '';
          else if (colKey === 'latest_shipment_date') val = r.latest_shipment_date ? format(new Date(r.latest_shipment_date), "MMM d, yy") : '';

          if (!val.toLowerCase().includes(filter.search.toLowerCase())) {
            return false;
          }
        }

        if (filter.selectedValues !== undefined && filter.selectedValues !== null) {
          if (!matchRowValue(r, colKey, filter.selectedValues)) {
            return false;
          }
        }
      }
      return true;
    });
  }, [rows, colFilters]);

  const sortedAndFiltered = useMemo(() => {
    if (!sortConfig || sortConfig.direction === null) return filtered;

    return [...filtered].sort((a, b) => {
      let valA: any = a[sortConfig.key];
      let valB: any = b[sortConfig.key];

      if (sortConfig.key === 'shipping') {
        valA = (a.inbound_cost ?? 0) + (a.outbound_cost ?? 0) + (a.internal_cost ?? 0);
        valB = (b.inbound_cost ?? 0) + (b.outbound_cost ?? 0) + (b.internal_cost ?? 0);
      } else if (sortConfig.key === 'vat_cost') {
        valA = (a.customs_cost ?? 0) + (a.vat_cost ?? 0);
        valB = (b.customs_cost ?? 0) + (b.vat_cost ?? 0);
      }

      if (valA === undefined || valA === null) valA = '';
      if (valB === undefined || valB === null) valB = '';

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
      }

      valA = String(valA).toLowerCase();
      valB = String(valB).toLowerCase();

      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtered, sortConfig]);

  const updateField = async (
    siteId: string, 
    field: 'handover_date' | 'latest_shipment_date' | 'status' | 'notes', 
    value: any,
    record: AirMonitorRow
  ): Promise<boolean> => {
    try {
      if (field === 'notes') {
        const { error } = await supabase
          .from("site_air_records")
          .update({ notes: value })
          .eq("site_id", siteId);
        if (error) throw error;
      } 
      else if (field === 'handover_date') {
        const { error } = await supabase
          .from("site_air_records")
          .update({ handover_date: value })
          .eq("site_id", siteId);
        if (error) throw error;
      }
      else if (field === 'latest_shipment_date') {
        const { error: hwErr } = await supabase
          .from("hardwares")
          .update({ shipment_date: value })
          .eq("site_id", siteId)
          .eq("category", "AIR");
        if (hwErr) throw hwErr;

        const { error: airErr } = await supabase
          .from("site_air_records")
          .update({ latest_shipment_date: value })
          .eq("site_id", siteId);
        if (airErr) throw airErr;
      }
      else if (field === 'status') {
        const { error: airErr } = await supabase
          .from("site_air_records")
          .update({ status: value })
          .eq("site_id", siteId);
        if (airErr) throw airErr;

        if (value === 'Delivered') {
          const { data: movements } = await supabase
            .from('ops_hardware_movements')
            .select('shipment_id, hardwares!inner(site_id, category)')
            .eq('hardwares.site_id', siteId)
            .eq('hardwares.category', 'AIR');
          
          const shipmentIds = Array.from(new Set(movements?.map(m => m.shipment_id).filter(Boolean)));
          if (shipmentIds.length > 0) {
            const { error: errShip } = await supabase
              .from('ops_shipments')
              .update({ status: 'delivered' })
              .in('id', shipmentIds)
              .eq('shipment_type', 'Outbound');
            if (errShip) throw errShip;
          }
        } else if (value === 'Assigned') {
          const { data: movements } = await supabase
            .from('ops_hardware_movements')
            .select('shipment_id, hardwares!inner(site_id, category)')
            .eq('hardwares.site_id', siteId)
            .eq('hardwares.category', 'AIR');
          
          const shipmentIds = Array.from(new Set(movements?.map(m => m.shipment_id).filter(Boolean)));
          if (shipmentIds.length > 0) {
            const { error: errShip } = await supabase
              .from('ops_shipments')
              .update({ status: 'awaiting dispatch' })
              .in('id', shipmentIds)
              .eq('shipment_type', 'Outbound');
            if (errShip) throw errShip;
          }
        }
      }

      toast({ title: "Saved", description: `${record.project_name ?? "Record"} updated successfully.` });
      await qc.invalidateQueries({ queryKey: ["monitor-air-rows"] });
      return true;
    } catch (error: any) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return false;
    }
  };

  const exportCSV = () => {
    if (!sortedAndFiltered.length) return;
    const headers = ["Project", "Status", "PM", "Region", "Country", "City", "Sensors", "POs", "Notes"];
    const lines = [
      headers.join(","),
      ...sortedAndFiltered.map((r) => [
        JSON.stringify(r.project_name ?? ""),
        JSON.stringify(r.status ?? ""),
        JSON.stringify(r.pm_name ?? ""),
        JSON.stringify(r.region ?? ""),
        JSON.stringify(r.country ?? ""),
        JSON.stringify(r.city ?? ""),
        r.total_sensors,
        JSON.stringify(r.po_numbers.join(" | ")),
        r.quotation_value,
        r.hardware_cost,
        r.total_cost,
        r.profit,
        r.roi,
        JSON.stringify(r.notes ?? ""),
      ].join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; 
    a.download = `air-monitors-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto">
      {/* Top action bar */}
      <div className="flex items-center justify-end gap-3 bg-white p-4 rounded-2xl border border-slate-200/60 shadow-sm">
        <Button variant="outline" size="sm" onClick={() => setShowFinancials(!showFinancials)} className={cn("gap-2 h-10 px-4", showFinancials ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "border-slate-200")}>
          <Activity className="h-4 w-4" /> {showFinancials ? "Hide Financials" : "Show Financials"}
        </Button>
        <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2 h-10 px-4 border-slate-200">
          <Download className="h-4 w-4" /> Export
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-slate-200/60 bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-24 flex flex-col items-center gap-4 text-slate-400"><Loader2 className="w-10 h-10 animate-spin text-indigo-500" /><p className="text-sm font-medium">Loading...</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200">
                  <th className="px-4 py-3.5 text-left sticky left-0 bg-slate-50/80 z-20 min-w-[320px]">
                    <ExcelHeaderCell 
                      title="Project & Location" 
                      colKey="project_name" 
                      rows={rows} 
                      colFilters={colFilters} 
                      setColFilters={setColFilters} 
                      sortConfig={sortConfig} 
                      setSortConfig={setSortConfig}
                    />
                  </th>
                  <th className="px-4 py-3.5 text-left w-28">
                    <ExcelHeaderCell title="Region" colKey="region" rows={rows} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} />
                  </th>
                  <th className="px-4 py-3.5 text-left w-32">
                    <ExcelHeaderCell title="Country" colKey="country" rows={rows} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} />
                  </th>
                  <th className="px-4 py-3.5 text-left w-36">
                    <ExcelHeaderCell title="PM" colKey="pm_name" rows={rows} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} />
                  </th>
                  <th className="px-4 py-3.5 text-center w-32">
                    <ExcelHeaderCell title="Sensors" colKey="total_sensors" rows={rows} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} className="justify-center" />
                  </th>
                  <th className="px-4 py-3.5 text-left w-32">
                    <ExcelHeaderCell title="POs" colKey="po_numbers" rows={rows} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} />
                  </th>
                  <th className="px-4 py-3.5 text-left w-36">
                    <ExcelHeaderCell title="Handover Date" colKey="handover_date" rows={rows} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} />
                  </th>
                  <th className="px-4 py-3.5 text-left w-36">
                    <ExcelHeaderCell title="Shipment Date" colKey="latest_shipment_date" rows={rows} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} />
                  </th>
                  {showFinancials && (
                    <>
                      <th className="px-4 py-3.5 text-right w-24">
                        <ExcelHeaderCell title="Quotation" colKey="quotation_value" rows={rows} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} className="justify-end" />
                      </th>
                      <th className="px-4 py-3.5 text-right w-24">
                        <ExcelHeaderCell title="HW Cost" colKey="hardware_cost" rows={rows} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} className="justify-end" />
                      </th>
                      <th className="px-4 py-3.5 text-right w-24">
                        <ExcelHeaderCell title="Shipping" colKey="shipping" rows={rows} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} className="justify-end" />
                      </th>
                      <th className="px-4 py-3.5 text-right w-24">
                        <ExcelHeaderCell title="Tax/Vat" colKey="vat_cost" rows={rows} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} className="justify-end" />
                      </th>
                      <th className="px-4 py-3.5 text-right w-24">
                        <ExcelHeaderCell title="Profit" colKey="profit" rows={rows} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} className="justify-end" />
                      </th>
                      <th className="px-4 py-3.5 text-center w-20">
                        <ExcelHeaderCell title="ROI" colKey="roi" rows={rows} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} className="justify-center" />
                      </th>
                    </>
                  )}
                  <th className="px-4 py-3.5 text-left w-28">
                    <ExcelHeaderCell title="Status" colKey="status" rows={rows} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} />
                  </th>
                  <th className="px-4 py-3.5 text-left min-w-[200px]">
                    <ExcelHeaderCell title="Notes" colKey="notes" rows={rows} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedAndFiltered.map((r, i) => (
                  <AirRow key={r.id} r={r} idx={i} onUpdate={updateField} showFinancials={showFinancials} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// (getSelectStatus moved to top of file)

function AirRow({ r, idx, onUpdate, showFinancials }: { r: AirMonitorRow & any; idx: number; onUpdate: any; showFinancials: boolean; }) {
  const [isEditingHandover, setIsEditingHandover] = useState(false);
  const [isEditingShipment, setIsEditingShipment] = useState(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);

  const isEven = idx % 2 === 0;
  const baseBg = isEven ? "bg-white" : "bg-slate-50";

  return (
    <tr className={cn("group transition-colors duration-150", baseBg, "hover:bg-slate-100/50")}>
      {/* 1. Project & Location */}
      <td className={cn("px-4 py-4 font-semibold text-slate-800 sticky left-0 z-10", isEven ? "bg-white" : "bg-slate-50", "group-hover:bg-slate-100 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)]")}>
        <div className="flex flex-col">
          <span className="text-sm font-bold tracking-tight">{r.project_name}</span>
          <span className="text-[10px] text-slate-400 font-normal mt-0.5">{r.city || <span className="text-slate-300 italic">No City</span>}</span>
        </div>
      </td>

      {/* 1b. Region */}
      <td className="px-4 py-4 text-xs text-slate-600 font-medium">
        {r.region || <span className="text-slate-300 italic">—</span>}
      </td>

      {/* 1c. Country */}
      <td className="px-4 py-4 text-xs text-slate-600 font-medium">
        {r.country || <span className="text-slate-300 italic">—</span>}
      </td>

      {/* 2. PM */}
      <td className="px-4 py-4 text-sm text-slate-600">
        {r.pm_name ? (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold">{r.pm_name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}</div>
            <span className="truncate max-w-[120px]">{r.pm_name}</span>
          </div>
        ) : <span className="text-slate-400 italic">Unassigned</span>}
      </td>

      {/* 3. Sensors assigned */}
      <td className="px-4 py-4 text-center">
        <Dialog>
          <DialogTrigger asChild>
            <button className={cn("inline-flex items-center justify-center min-w-[2.2rem] h-8 px-2.5 rounded-lg text-xs font-bold transition-all shadow-sm", r.total_sensors > 0 ? "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 ring-1 ring-indigo-100" : "bg-slate-100 text-slate-500")}>
              {r.total_sensors}
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-xl border-none shadow-2xl rounded-2xl overflow-hidden">
            <DialogHeader className="bg-slate-50 -m-6 p-6 mb-2 border-b border-slate-100">
              <DialogTitle className="flex items-center gap-2 text-indigo-700 uppercase tracking-tight">
                <Monitor className="w-5 h-5" /> {r.project_name}
              </DialogTitle>
            </DialogHeader>
            <DeviceModalContent siteId={r.id} projectName={r.project_name} />
          </DialogContent>
        </Dialog>
      </td>

      {/* 4. PO Numbers */}
      <td className="px-4 py-4">
        <div className="flex flex-wrap gap-1.5 max-w-[180px]">
          {r.po_numbers.length > 0 ? r.po_numbers.map(po => (
            <Badge key={po} variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 text-[10px] font-mono px-1.5 h-5">{po}</Badge>
          )) : <span className="text-slate-400">—</span>}
        </div>
      </td>

      {/* 5. Handover Date (Inline Editable) */}
      {isEditingHandover ? (
        <td className="px-4 py-4 whitespace-nowrap">
          <Input 
            type="date"
            defaultValue={r.handover_date ? new Date(r.handover_date).toISOString().split('T')[0] : ''}
            autoFocus
            onBlur={async (e) => {
              setIsEditingHandover(false);
              const newVal = e.target.value;
              if (newVal !== (r.handover_date ? new Date(r.handover_date).toISOString().split('T')[0] : '')) {
                await onUpdate(r.id, 'handover_date', newVal ? new Date(newVal).toISOString() : null, r);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="h-8 text-xs bg-white focus-visible:ring-indigo-500/20 w-36"
          />
        </td>
      ) : (
        <td 
          className="px-4 py-4 whitespace-nowrap cursor-pointer hover:bg-slate-50/50" 
          onClick={() => setIsEditingHandover(true)}
        >
          <span className="text-xs text-slate-600 font-medium">
            {r.handover_date ? format(new Date(r.handover_date), "MMM d, yy") : <span className="text-slate-300 italic">No date</span>}
          </span>
        </td>
      )}

      {/* 6. Shipment Date (Inline Editable) */}
      {isEditingShipment ? (
        <td className="px-4 py-4 whitespace-nowrap">
          <Input 
            type="date"
            defaultValue={r.latest_shipment_date ? new Date(r.latest_shipment_date).toISOString().split('T')[0] : ''}
            autoFocus
            onBlur={async (e) => {
              setIsEditingShipment(false);
              const newVal = e.target.value;
              if (newVal !== (r.latest_shipment_date ? new Date(r.latest_shipment_date).toISOString().split('T')[0] : '')) {
                await onUpdate(r.id, 'latest_shipment_date', newVal ? new Date(newVal).toISOString() : null, r);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="h-8 text-xs bg-white focus-visible:ring-indigo-500/20 w-36"
          />
        </td>
      ) : (
        <td 
          className="px-4 py-4 whitespace-nowrap cursor-pointer hover:bg-slate-50/50" 
          onClick={() => setIsEditingShipment(true)}
        >
          <span className="text-xs text-slate-500">
            {r.latest_shipment_date ? format(new Date(r.latest_shipment_date), "MMM d, yy") : <span className="text-slate-300 italic">—</span>}
          </span>
        </td>
      )}

      {/* Financials columns */}
      {showFinancials && (
        <>
          <td className="px-4 py-4 text-right font-bold text-indigo-600 text-xs">€{r.quotation_value?.toLocaleString() || '0'}</td>
          <td className="px-4 py-4 text-right text-slate-500 text-xs">€{r.hardware_cost?.toLocaleString() || '0'}</td>
          <td className="px-4 py-4 text-right text-slate-500 text-xs">€{((r.inbound_cost ?? 0) + (r.outbound_cost ?? 0) + (r.internal_cost ?? 0))?.toLocaleString() || '0'}</td>
          <td className="px-4 py-4 text-right text-slate-500 text-xs">€{((r.customs_cost ?? 0) + (r.vat_cost ?? 0))?.toLocaleString() || '0'}</td>
          <td className={cn("px-4 py-4 text-right font-bold text-xs", r.profit >= 0 ? "text-emerald-600" : "text-rose-600")}>€{r.profit?.toLocaleString() || '0'}</td>
          <td className="px-4 py-4 text-center">
            <Badge variant="outline" className={cn("text-[10px] font-bold h-5 px-1.5", r.roi >= 20 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-600")}>
              {Math.round(r.roi)}%
            </Badge>
          </td>
        </>
      )}

      {/* 7. Status (Inline Dropdown Select) */}
      <td className="px-4 py-4">
        <Select 
          value={getSelectStatus(r.status)} 
          onValueChange={async (v) => {
            await onUpdate(r.id, 'status', v, r);
          }}
        >
          <SelectTrigger className="h-auto p-0 border-none bg-transparent focus:ring-0 focus:ring-offset-0 text-left outline-none cursor-pointer">
            <StatusBadge status={r.status} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Upcoming">Upcoming</SelectItem>
            <SelectItem value="Assigned">Assigned</SelectItem>
            <SelectItem value="Delivered">Delivered</SelectItem>
          </SelectContent>
        </Select>
      </td>

      {/* 8. Notes (Inline Editable, moved to end) */}
      {isEditingNotes ? (
        <td className="px-4 py-4 min-w-[200px]">
          <Input 
            defaultValue={r.notes ?? ''}
            autoFocus
            onBlur={async (e) => {
              setIsEditingNotes(false);
              const newVal = e.target.value;
              if (newVal !== (r.notes ?? '')) {
                await onUpdate(r.id, 'notes', newVal || null, r);
              }
            }}
            onKeyDown={async (e) => {
              if (e.key === 'Enter') {
                setIsEditingNotes(false);
                const newVal = (e.target as HTMLInputElement).value;
                if (newVal !== (r.notes ?? '')) {
                  await onUpdate(r.id, 'notes', newVal || null, r);
                }
              }
            }}
            className="h-8 text-xs bg-white focus-visible:ring-indigo-500/20"
          />
        </td>
      ) : (
        <td 
          className="px-4 py-4 min-w-[200px] cursor-pointer hover:bg-slate-50/50" 
          onClick={() => setIsEditingNotes(true)}
        >
          <p className="text-sm text-slate-600 truncate" title={r.notes ?? undefined}>
            {r.notes || <span className="text-slate-300 italic">No notes</span>}
          </p>
        </td>
      )}
    </tr>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-slate-400 text-xs">—</span>;
  const isCompound = status.includes(',');
  const display = isCompound ? status : status.replace(/^\d+\s+/, '');
  const s = display.toLowerCase();
  const configs = [
    { test: /delivered|complete|installed/i, icon: CheckCircle2, color: "text-emerald-700 bg-emerald-50 border-emerald-200/60", dot: "bg-emerald-500" },
    { test: /shipped|transit/i, icon: Loader2, color: "text-sky-700 bg-sky-50 border-sky-200/60", dot: "bg-sky-500", spin: true },
    { test: /pending|upcoming|assigned/i, icon: Clock, color: "text-amber-700 bg-amber-50 border-amber-200/60", dot: "bg-amber-500" },
  ];
  const cfg = configs.find(c => c.test.test(s)) ?? configs[2];
  const Icon = cfg.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9.5px] font-bold uppercase tracking-wide border whitespace-nowrap", cfg.color)}>
      <span className={cn("w-1 h-1 rounded-full", cfg.dot, cfg.spin && "animate-pulse")} />
      <Icon className={cn("w-2.5 h-2.5", cfg.spin && "animate-spin")} />
      <span className="truncate max-w-[120px]">{display}</span>
    </span>
  );
}
