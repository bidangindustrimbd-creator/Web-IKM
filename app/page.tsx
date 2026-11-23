"use client";

import dynamic from "next/dynamic";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  CircleHelp,
  Cloud,
  Database,
  Edit3,
  Filter,
  Layers3,
  LogIn,
  LogOut,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  Store,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import type { EconomyRecord, MapPoint, PointCategory, IkmBusinessTypeRecord, IkmRecord } from "@/lib/database.types";
import { parseCsv, serializeCsv } from "@/lib/csv";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  categoryLabels,
  economySchema,
  isInsideMbd,
  pointSchema,
  type EconomyInput,
  type PointInput,
  type IkmBusinessTypeInput,
  type IkmInput,
  type VillageCollection,
  businessTypeFields,
  ikmBusinessTypeSchema,
  ikmSchema,
} from "@/lib/validation";

const MapCanvas = dynamic(() => import("@/components/mbd-map"), {
  ssr: false,
  loading: () => <div className="map-loading">Memuat peta wilayah…</div>,
});

type Tab = "dashboard" | "map" | "villages" | "points" | "ikm" | "business-types" | "economy";
type WorkspaceTab = Exclude<Tab, "villages">;
type AuthMode = "sign-in" | "reset-password" | "new-password";
type Editor = { kind: "point"; row: MapPoint | null } |
  { kind: "ikm"; row: IkmRecord | null } |
  { kind: "business-types"; row: IkmBusinessTypeRecord | null } |
  { kind: "economy"; row: EconomyRecord | null };
type Village = VillageCollection["features"][number]["properties"];

const tabs: { id: WorkspaceTab; label: string; icon: typeof MapPin }[] = [
  { id: "dashboard", label: "Ringkasan IKM", icon: Activity },
  { id: "map", label: "Peta IKM", icon: MapPin },
  { id: "ikm", label: "IKM per desa", icon: Store },
];
const visitorTabs: { id: Tab; label: string; icon: typeof MapPin }[] = [
  { id: "dashboard", label: "Ringkasan IKM", icon: Activity },
  { id: "map", label: "Peta IKM", icon: MapPin },
  { id: "villages", label: "Desa", icon: Building2 },
  { id: "ikm", label: "IKM per desa", icon: Store },
];

const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
const numberFormat = new Intl.NumberFormat("id-ID");

export default function HomePage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(!supabase);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);
  const [villages, setVillages] = useState<VillageCollection | null>(null);
  const [selectedVillageCode, setSelectedVillageCode] = useState<string | null>(null);
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [ikm, setIkm] = useState<IkmRecord[]>([]);
  const [businessTypes, setBusinessTypes] = useState<IkmBusinessTypeRecord[]>([]);
  const [economy, setEconomy] = useState<EconomyRecord[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [query, setQuery] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const dataLoadSequence = useRef(0);
  const hasLoadedData = useRef(false);
  const isVisitor = authChecked && !session;
  const navigationTabs = isVisitor
    ? visitorTabs
    : isAdmin
      ? tabs
      : tabs.filter((tab) => tab.id !== "business-types");

  const notify = useCallback((text: string, type: "success" | "error" = "success") => {
    setToast({ text, type });
    window.setTimeout(() => setToast(null), 4200);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/data/mbd-villages.geojson")
      .then(async (response) => {
        if (!response.ok) throw new Error("Berkas batas wilayah tidak dapat dimuat.");
        return response.json() as Promise<VillageCollection>;
      })
      .then((data) => {
        if (active) setVillages(data);
      })
      .catch(() => {
        if (active) notify("Data batas wilayah gagal dimuat. Muat ulang halaman untuk mencoba kembali.", "error");
      });
    return () => { active = false; };
  }, [notify]);

  useEffect(() => {
    if (!supabase) return;

    let active = true;
    void supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) notify(`Status autentikasi gagal diperiksa: ${error.message}`, "error");
        setSession(data.session);
        setAuthChecked(true);
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : "Kesalahan tidak diketahui.";
        notify(`Status autentikasi gagal diperiksa: ${message}`, "error");
        setSession(null);
        setAuthChecked(true);
      });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setAuthChecked(true);
      setIsAdmin(false);
      setAdminChecked(!nextSession);
        if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
          setActiveTab("dashboard");
          setSelectedVillageCode(null);
          setSelectedDistrict("");
          setQuery("");
        }
        if (!nextSession) setEditor(null);
      if (event === "PASSWORD_RECOVERY") {
        setAuthMode("new-password");
        setAuthMessage("");
        setShowAuth(true);
      } else if (nextSession) {
        setShowAuth(false);
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [notify, supabase]);

  useEffect(() => {
    let active = true;
    const checkAdmin = async () => {
      if (!supabase || !session) {
        setIsAdmin(false);
        setAdminChecked(true);
        return;
      }

      setAdminChecked(false);
      try {
        const { data, error } = await supabase.rpc("is_app_admin");
        if (!active) return;
        if (error) {
          setIsAdmin(false);
          notify(`Hak admin gagal diperiksa: ${error.message}`, "error");
        } else {
          setIsAdmin(data);
        }
        setAdminChecked(true);
      } catch (error: unknown) {
        if (!active) return;
        const message = error instanceof Error ? error.message : "Kesalahan tidak diketahui.";
        setIsAdmin(false);
        setAdminChecked(true);
        notify(`Hak admin gagal diperiksa: ${message}`, "error");
      }
    };
    void Promise.resolve().then(checkAdmin);

    return () => { active = false; };
  }, [notify, session, supabase]);

  const loadData = useCallback(async () => {
    if (!supabase) return;
    const sequence = ++dataLoadSequence.current;
    if (!hasLoadedData.current) setLoadingData(true);
    try {
      const ikmResult = await loadAllPages((from, to) => supabase.from("umkm_records").select("*")
        .order("year", { ascending: false }).order("id", { ascending: true }).range(from, to));
      if (sequence !== dataLoadSequence.current) return;
        if (ikmResult.error) {
          notify(`Data IKM gagal dimuat: ${ikmResult.error.message}`, "error");
        return;
      }
        setIkm(ikmResult.data);
      hasLoadedData.current = true;
    } catch (error: unknown) {
      if (sequence !== dataLoadSequence.current) return;
      const message = error instanceof Error ? error.message : "Kesalahan tidak diketahui.";
      notify(`Data gagal dimuat: ${message}`, "error");
    } finally {
      if (sequence === dataLoadSequence.current) setLoadingData(false);
    }
  }, [notify, supabase]);

  useEffect(() => {
    if (!supabase) return;

    let refreshTimer: number | null = null;
    let realtimeErrorReported = false;
    const refreshData = () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        void Promise.resolve().then(loadData);
      }, 200);
    };
    const channel = supabase
      .channel("shared-data-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "umkm_records" }, refreshData)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          realtimeErrorReported = false;
        } else if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT") && !realtimeErrorReported) {
          realtimeErrorReported = true;
          notify("Pembaruan real-time data IKM gagal tersambung. Pastikan migrasi Realtime sudah dijalankan di Supabase.", "error");
        }
      });

    void Promise.resolve().then(loadData);
    return () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      dataLoadSequence.current += 1;
      void supabase.removeChannel(channel);
    };
  }, [loadData, notify, supabase]);

  const districtOptions = useMemo(
    () => [...new Set(villages?.features.map((feature) => feature.properties.kecamatan) ?? [])]
      .sort((a, b) => a.localeCompare(b, "id")),
    [villages],
  );
  const villageByCode = useMemo(() => {
    const lookup = new Map<string, Village>();
    villages?.features.forEach((feature) => lookup.set(feature.properties.code, feature.properties));
    return lookup;
  }, [villages]);
  const visiblePoints = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("id");
    return points.filter((point) => {
      const village = villageByCode.get(point.village_code);
      const matchesTerm = !term || [point.name, point.description, village?.name, village?.kecamatan, categoryLabels[point.category]]
        .some((value) => value?.toLocaleLowerCase("id").includes(term));
      return matchesTerm && (!selectedDistrict || village?.kecamatan === selectedDistrict);
    });
  }, [points, query, selectedDistrict, villageByCode]);
  const visibleIkm = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("id");
    return ikm.filter((row) => {
      const village = villageByCode.get(row.village_code);
      return (!term || village?.name.toLocaleLowerCase("id").includes(term) || village?.kecamatan.toLocaleLowerCase("id").includes(term))
        && (!selectedDistrict || village?.kecamatan === selectedDistrict);
    });
  }, [query, selectedDistrict, ikm, villageByCode]);
  const visibleBusinessTypes = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("id");
    return businessTypes.filter((row) => {
      const village = villageByCode.get(row.village_code);
      return (!term || village?.name.toLocaleLowerCase("id").includes(term) || village?.kecamatan.toLocaleLowerCase("id").includes(term))
        && (!selectedDistrict || village?.kecamatan === selectedDistrict);
    });
  }, [businessTypes, query, selectedDistrict, villageByCode]);
  const visibleEconomy = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("id");
    return economy.filter((row) => {
      const village = villageByCode.get(row.village_code);
      return (!term || village?.name.toLocaleLowerCase("id").includes(term) || village?.kecamatan.toLocaleLowerCase("id").includes(term))
        && (!selectedDistrict || village?.kecamatan === selectedDistrict);
    });
  }, [economy, query, selectedDistrict, villageByCode]);
  const latestIkm = useMemo(() => latestByVillage(visibleIkm), [visibleIkm]);
  const visibleLatestIkm = latestIkm;
  const ikmTotals = useMemo(
    () => latestIkm.reduce((totals, row) => ({
      small: totals.small + row.small,
      medium: totals.medium + row.medium,
    }), { small: 0, medium: 0 }),
    [latestIkm],
  );
  const reportingVillageCount = latestIkm.length;
  const latestIkmForDisplay = useMemo(
    () => [...latestIkm]
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.year - a.year)
      .slice(0, 5),
    [latestIkm],
  );
  const latestIkmByVillage = useMemo(
    () => new Map(latestByVillage(ikm).map((record) => [record.village_code, record])),
    [ikm],
  );
  const selectedVillage = selectedVillageCode ? villageByCode.get(selectedVillageCode) : undefined;
  const selectedVillageIkm = selectedVillageCode ? latestIkmByVillage.get(selectedVillageCode) : undefined;
  const visibleVillages = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("id");
    return (villages?.features.map((feature) => feature.properties) ?? [])
      .filter((village) => (!term || village.name.toLocaleLowerCase("id").includes(term)
        || village.kecamatan.toLocaleLowerCase("id").includes(term))
        && (!selectedDistrict || village.kecamatan === selectedDistrict))
      .sort((a, b) => a.name.localeCompare(b.name, "id"));
  }, [query, selectedDistrict, villages]);
  const villageMapIkm = isVisitor && selectedVillageCode
    ? ikm.filter((record) => record.village_code === selectedVillageCode)
    : visibleIkm;

  const selectVillage = (village: Village) => {
    setSelectedVillageCode(village.code);
    setSelectedDistrict(village.kecamatan);
    setQuery("");
    setActiveTab("map");
  };

  const handleSavePoint = async (input: PointInput, id: string | null) => {
    if (!supabase || !session || !isAdmin) return notify("Hanya admin yang dapat mengubah data bersama.", "error");
    const village = villageByCode.get(input.village_code);
    if (!village) return notify("Pilih desa yang tersedia dari daftar.", "error");
    if (!isInsideMbd(input.lat, input.lng, villages, input.village_code)) {
      return notify(`Koordinat harus berada di wilayah Desa ${village.name}.`, "error");
    }
    setBusy(true);
    const payload = {
      name: input.name,
      village_code: input.village_code,
      category: input.category,
      lat: input.lat,
      lng: input.lng,
      value: input.value,
      description: input.description,
    };
    const result = id
      ? await supabase.from("map_points").update(payload).eq("id", id).select().single()
      : await supabase.from("map_points").insert(payload).select().single();
    setBusy(false);
    if (result.error) return notify(`Titik gagal disimpan: ${result.error.message}`, "error");
    setPoints((current) => id ? current.map((item) => item.id === id ? result.data : item) : [result.data, ...current]);
    setEditor(null);
    notify(id ? "Perubahan titik tersimpan." : "Titik baru ditambahkan.");
  };

  const handleSaveIkm = async (input: IkmInput, id: string | null) => {
    if (!supabase || !session || !isAdmin) return notify("Hanya admin yang dapat mengubah data bersama.", "error");
    if (!villageByCode.has(input.village_code)) return notify("Pilih desa yang tersedia dari daftar.", "error");
    setBusy(true);
    const payload = { ...input };
    const result = id
      ? await supabase.from("umkm_records").update(payload).eq("id", id).select().single()
      : await supabase.from("umkm_records").upsert(payload, { onConflict: "user_id,village_code,year" }).select().single();
    setBusy(false);
    if (result.error) return notify(`Data IKM gagal disimpan: ${result.error.message}`, "error");
    setIkm((current) => mergeRecordsById(current, [result.data]));
    setEditor(null);
    notify("Data IKM tersimpan.");
  };

  const handleSaveBusinessTypes = async (input: IkmBusinessTypeInput, id: string | null) => {
    if (!supabase || !session || !isAdmin) return notify("Hanya admin yang dapat mengubah data bersama.", "error");
    if (!villageByCode.has(input.village_code)) return notify("Pilih desa yang tersedia dari daftar.", "error");
    setBusy(true);
    const result = id
      ? await supabase.from("umkm_business_type_records").update(input).eq("id", id).select().single()
      : await supabase.from("umkm_business_type_records")
        .upsert(input, { onConflict: "village_code,year" }).select().single();
    setBusy(false);
    if (result.error) return notify(`Jumlah jenis usaha gagal disimpan: ${result.error.message}`, "error");
    setBusinessTypes((current) => mergeRecordsById(current, [result.data]));
    setEditor(null);
    notify("Jumlah jenis usaha tersimpan.");
  };

  const handleSaveEconomy = async (input: EconomyInput, id: string | null) => {
    if (!supabase || !session || !isAdmin) return notify("Hanya admin yang dapat mengubah data bersama.", "error");
    if (!villageByCode.has(input.village_code)) return notify("Pilih desa yang tersedia dari daftar.", "error");
    setBusy(true);
    const result = id
      ? await supabase.from("economy_records").update(input).eq("id", id).select().single()
      : await supabase.from("economy_records").upsert(input, { onConflict: "user_id,village_code,year" }).select().single();
    setBusy(false);
    if (result.error) return notify(`Data ekonomi gagal disimpan: ${result.error.message}`, "error");
    setEconomy((current) => mergeRecordsById(current, [result.data]));
    setEditor(null);
    notify("Data ekonomi tersimpan.");
  };

  const handleDelete = async (kind: "point" | "ikm" | "business-types" | "economy", id: string) => {
    if (!supabase || !session || !isAdmin) return notify("Hanya admin yang dapat menghapus data bersama.", "error");
    if (!window.confirm("Hapus data ini secara permanen?")) return;
    const error = kind === "point"
      ? (await supabase.from("map_points").delete().eq("id", id)).error
      : kind === "ikm"
        ? (await supabase.from("umkm_records").delete().eq("id", id)).error
        : kind === "business-types"
          ? (await supabase.from("umkm_business_type_records").delete().eq("id", id)).error
          : (await supabase.from("economy_records").delete().eq("id", id)).error;
    if (error) return notify(`Data gagal dihapus: ${error.message}`, "error");
    if (kind === "point") setPoints((current) => current.filter((item) => item.id !== id));
    if (kind === "ikm") setIkm((current) => current.filter((item) => item.id !== id));
    if (kind === "business-types") setBusinessTypes((current) => current.filter((item) => item.id !== id));
    if (kind === "economy") setEconomy((current) => current.filter((item) => item.id !== id));
    notify("Data berhasil dihapus.");
  };

  const handleImportCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    input.value = "";

    if (!supabase || !session || !isAdmin) return notify("Hanya admin yang dapat mengimpor data bersama.", "error");
    if (file.size > 5 * 1024 * 1024) return notify("Ukuran file maksimal 5 MB.", "error");

    setBusy(true);
    try {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) throw new Error("CSV harus berisi judul kolom dan sedikitnya satu baris data.");
      if (rows.length > 5001) throw new Error("Impor dibatasi maksimal 5.000 baris per file.");

      const headers = rows[0].map((header) => header.trim().toLocaleLowerCase("id"));
      if (new Set(headers).size !== headers.length) throw new Error("CSV memiliki judul kolom yang sama lebih dari sekali.");
      const indexes = new Map(headers.map((header, index) => [header, index]));
      const requiredHeaders = activeTab === "points"
        ? ["nama", "desa", "kecamatan", "kategori", "latitude", "longitude", "nilai", "keterangan"]
        : activeTab === "ikm"
          ? ["desa", "kecamatan", "kecil", "menengah", "sumber"]
          : activeTab === "business-types"
            ? ["desa", "kecamatan", "tahun", "kuliner", "fashion", "kerajinan", "agribisnis_perikanan", "perdagangan", "jasa_pariwisata", "ekonomi_kreatif_digital", "sumber"]
          : activeTab === "economy"
            ? ["desa", "kecamatan", "omzet", "tenaga_kerja", "investasi"]
            : null;
      if (!requiredHeaders) throw new Error("Pilih tab data sebelum mengimpor.");
      const missingHeaders = requiredHeaders.filter((header) => !indexes.has(header));
      if (missingHeaders.length) throw new Error(`Kolom CSV tidak lengkap: ${missingHeaders.join(", ")}.`);

      const get = (cells: string[], header: string) => cells[indexes.get(header)!]?.trim() ?? "";
      const normalized = (value: string) => value.trim().toLocaleLowerCase("id");
      const resolveVillage = (name: string, district: string) => {
        const matches = villages?.features.filter((feature) => {
          const properties = feature.properties;
          const nameMatches = normalized(properties.name) === normalized(name) || properties.code === name.trim();
          return nameMatches && (!district || normalized(properties.kecamatan) === normalized(district));
        }) ?? [];
        return matches.length === 1 ? matches[0].properties : null;
      };

      if (activeTab === "points") {
        const payloads: PointInput[] = [];
        for (const [index, cells] of rows.slice(1).entries()) {
          if (cells.length !== headers.length) throw new Error(`Jumlah kolom pada baris ${index + 2} tidak sesuai judul kolom.`);
          const village = resolveVillage(get(cells, "desa"), get(cells, "kecamatan"));
          if (!village) throw new Error(`Desa pada baris ${index + 2} tidak ditemukan atau nama desa ambigu.`);
          const category = normalized(get(cells, "kategori"));
          const categoryValue = Object.entries(categoryLabels)
            .find(([key, label]) => normalized(key) === category || normalized(label) === category)?.[0];
          const parsed = pointSchema.safeParse({
            name: get(cells, "nama"),
            village_code: village.code,
            category: categoryValue,
            lat: get(cells, "latitude"),
            lng: get(cells, "longitude"),
            value: get(cells, "nilai"),
            description: get(cells, "keterangan"),
          });
          if (!parsed.success) throw new Error(`Baris ${index + 2}: ${parsed.error.issues[0]?.message ?? "Data tidak valid."}`);
          if (!isInsideMbd(parsed.data.lat, parsed.data.lng, villages, parsed.data.village_code)) {
            throw new Error(`Koordinat pada baris ${index + 2} berada di luar wilayah Desa ${village.name}.`);
          }
          payloads.push(parsed.data);
        }

        const { data, error } = await supabase.from("map_points").insert(payloads).select();
        if (error) throw new Error(`Titik lapangan gagal diimpor: ${error.message}`);
        setPoints((current) => [...data, ...current]);
      } else if (activeTab === "ikm") {
        const year = new Date().getFullYear();
        const payloads: IkmInput[] = [];
        const seenVillages = new Set<string>();
        for (const [index, cells] of rows.slice(1).entries()) {
          if (cells.length !== headers.length) throw new Error(`Jumlah kolom pada baris ${index + 2} tidak sesuai judul kolom.`);
          const village = resolveVillage(get(cells, "desa"), get(cells, "kecamatan"));
          if (!village) throw new Error(`Desa pada baris ${index + 2} tidak ditemukan atau nama desa ambigu.`);
          if (seenVillages.has(village.code)) throw new Error(`Desa ${village.name} muncul lebih dari sekali di file.`);
          seenVillages.add(village.code);
          const existingRecord = ikm.find((record) => record.user_id === session.user.id
            && record.village_code === village.code && record.year === year);
          const parsed = ikmSchema.safeParse({
            village_code: village.code, year,
            micro: existingRecord?.micro ?? 0,
            small: get(cells, "kecil"), medium: get(cells, "menengah"),
            source: get(cells, "sumber"),
            description_micro: existingRecord?.description_micro ?? "",
            description_small: indexes.has("deskripsi_kecil") ? get(cells, "deskripsi_kecil") : "",
            description_medium: indexes.has("deskripsi_menengah") ? get(cells, "deskripsi_menengah") : "",
          });
          if (!parsed.success) throw new Error(`Baris ${index + 2}: ${parsed.error.issues[0]?.message ?? "Data tidak valid."}`);
          payloads.push(parsed.data);
        }

        const { data, error } = await supabase.from("umkm_records")
          .upsert(payloads, { onConflict: "user_id,village_code,year" }).select();
        if (error) throw new Error(`Data IKM gagal diimpor: ${error.message}`);
        setIkm((current) => mergeRecordsById(current, data));
      } else if (activeTab === "business-types") {
        const payloads: IkmBusinessTypeInput[] = [];
        const seenVillageYears = new Set<string>();
        for (const [index, cells] of rows.slice(1).entries()) {
          if (cells.length !== headers.length) throw new Error(`Jumlah kolom pada baris ${index + 2} tidak sesuai judul kolom.`);
          const village = resolveVillage(get(cells, "desa"), get(cells, "kecamatan"));
          if (!village) throw new Error(`Desa pada baris ${index + 2} tidak ditemukan atau nama desa ambigu.`);
          const year = get(cells, "tahun");
          const key = `${village.code}:${year}`;
          if (seenVillageYears.has(key)) throw new Error(`Desa ${village.name} muncul lebih dari sekali pada tahun ${year}.`);
          seenVillageYears.add(key);
          const parsed = ikmBusinessTypeSchema.safeParse({
            village_code: village.code,
            year,
            culinary: get(cells, "kuliner"),
            fashion: get(cells, "fashion"),
            handicraft: get(cells, "kerajinan"),
            agribusiness_fisheries: get(cells, "agribisnis_perikanan"),
            trade: get(cells, "perdagangan"),
            services_tourism: get(cells, "jasa_pariwisata"),
            creative_digital: get(cells, "ekonomi_kreatif_digital"),
            source: get(cells, "sumber"),
          });
          if (!parsed.success) throw new Error(`Baris ${index + 2}: ${parsed.error.issues[0]?.message ?? "Data tidak valid."}`);
          payloads.push(parsed.data);
        }

        const { data, error } = await supabase.from("umkm_business_type_records")
          .upsert(payloads, { onConflict: "village_code,year" }).select();
        if (error) throw new Error(`Jumlah jenis usaha gagal diimpor: ${error.message}`);
        setBusinessTypes((current) => mergeRecordsById(current, data));
      } else {
        const year = new Date().getFullYear();
        const payloads: EconomyInput[] = [];
        const seenVillages = new Set<string>();
        for (const [index, cells] of rows.slice(1).entries()) {
          if (cells.length !== headers.length) throw new Error(`Jumlah kolom pada baris ${index + 2} tidak sesuai judul kolom.`);
          const village = resolveVillage(get(cells, "desa"), get(cells, "kecamatan"));
          if (!village) throw new Error(`Desa pada baris ${index + 2} tidak ditemukan atau nama desa ambigu.`);
          if (seenVillages.has(village.code)) throw new Error(`Desa ${village.name} muncul lebih dari sekali di file.`);
          seenVillages.add(village.code);
          const parsed = economySchema.safeParse({
            village_code: village.code, year,
            turnover: get(cells, "omzet"), workers: get(cells, "tenaga_kerja"), investment: get(cells, "investasi"),
          });
          if (!parsed.success) throw new Error(`Baris ${index + 2}: ${parsed.error.issues[0]?.message ?? "Data tidak valid."}`);
          payloads.push(parsed.data);
        }

        const { data, error } = await supabase.from("economy_records")
          .upsert(payloads, { onConflict: "user_id,village_code,year" }).select();
        if (error) throw new Error(`Data ekonomi gagal diimpor: ${error.message}`);
        setEconomy((current) => mergeRecordsById(current, data));
      }

      notify(`${rows.length - 1} baris berhasil diimpor.`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Kesalahan tidak diketahui.";
      notify(`Impor CSV gagal: ${message}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setAuthMessage("");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setAuthMessage(`Gagal masuk: ${error.message}`);
        return;
      }
      setPassword("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Kesalahan tidak diketahui.";
      setAuthMessage(`Gagal masuk: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  const handlePasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setAuthMessage("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin,
      });
      if (error) {
        setAuthMessage(`Tautan atur ulang kata sandi gagal dikirim: ${error.message}`);
        return;
      }
      setAuthMessage("Jika email terdaftar, tautan untuk mengatur ulang kata sandi akan dikirim. Periksa kotak masuk dan folder spam.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Kesalahan tidak diketahui.";
      setAuthMessage(`Tautan atur ulang kata sandi gagal dikirim: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleUpdatePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    if (newPassword !== confirmPassword) {
      setAuthMessage("Konfirmasi kata sandi tidak sama.");
      return;
    }
    setBusy(true);
    setAuthMessage("");
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setAuthMessage(`Kata sandi gagal diperbarui: ${error.message}`);
        return;
      }
      setNewPassword("");
      setConfirmPassword("");
      setAuthMessage("Kata sandi berhasil diperbarui. Anda sudah masuk.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Kesalahan tidak diketahui.";
      setAuthMessage(`Kata sandi gagal diperbarui: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) notify(`Gagal keluar: ${error.message}`, "error");
    else notify("Anda sudah keluar.");
  };

  const downloadCsv = () => {
    let headings: string[];
    let rows: string[][];
    if (activeTab === "ikm") {
      headings = ["desa", "kecamatan", "kecil", "menengah", "sumber", "deskripsi_kecil", "deskripsi_menengah"];
      rows = visibleLatestIkm.map((row) => {
        const village = villageByCode.get(row.village_code);
        return [
          village?.name ?? row.village_code,
          village?.kecamatan ?? "",
          String(row.small),
          String(row.medium),
          row.source,
          row.description_small,
          row.description_medium,
        ];
      });
    } else if (activeTab === "business-types") {
      headings = [
        "desa", "kecamatan", "tahun", "kuliner", "fashion", "kerajinan",
        "agribisnis_perikanan", "perdagangan", "jasa_pariwisata",
        "ekonomi_kreatif_digital", "sumber",
      ];
      rows = visibleBusinessTypes.map((row) => {
        const village = villageByCode.get(row.village_code);
        return [
          village?.name ?? row.village_code,
          village?.kecamatan ?? "",
          String(row.year),
          ...businessTypeFields.map(({ field }) => String(row[field])),
          row.source,
        ];
      });
    } else if (activeTab === "economy") {
      headings = ["desa", "kecamatan", "omzet", "tenaga_kerja", "investasi"];
      rows = visibleEconomy.map((row) => {
        const village = villageByCode.get(row.village_code);
        return [village?.name ?? row.village_code, village?.kecamatan ?? "", String(row.turnover), String(row.workers), String(row.investment)];
      });
    } else {
      headings = ["nama", "desa", "kecamatan", "kategori", "latitude", "longitude", "nilai", "keterangan"];
      rows = visiblePoints.map((row) => {
        const village = villageByCode.get(row.village_code);
        return [row.name, village?.name ?? row.village_code, village?.kecamatan ?? "", categoryLabels[row.category], String(row.lat), String(row.lng), row.value == null ? "" : String(row.value), row.description];
      });
    }
    const content = serializeCsv([headings, ...rows]);
    const url = URL.createObjectURL(new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    const exportName = activeTab === "ikm" ? "ikm-per-desa" : activeTab;
    anchor.download = `data-mbd-${exportName}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <main className="app">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Peta IKM Maluku Barat Daya">
          <span className="brand-mark"><MapPin size={20} fill="currentColor" /></span>
          <span className="brand-copy"><strong>Peta <em>IKM MBD</em></strong><small>Maluku Barat Daya</small></span>
        </a>
        <div className="topbar-center"><span className="live-dot" /> Industri kecil dan menengah <span className="topbar-divider">/</span> <span>17 kecamatan · 118 desa</span></div>
        <div className="topbar-actions">
          {session ? (
            <>
              <span className="user-chip"><span className="avatar">{(session.user.email?.[0] ?? "U").toUpperCase()}</span><span>{session.user.email}</span></span>
              <button className="icon-button" onClick={handleSignOut} title="Keluar" aria-label="Keluar"><LogOut size={17} /></button>
            </>
          ) : (
            <button className="button button--primary button--small" onClick={() => { setAuthMode("sign-in"); setShowAuth(true); setAuthMessage(""); }} disabled={!supabase}>
              <LogIn size={15} /> Masuk
            </button>
          )}
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-heading">
            <div><p className="eyebrow">PETA TEMATIK</p><h1>IKM Maluku Barat Daya</h1></div>
          </div>

          <nav className={`sidebar-nav ${isVisitor ? "sidebar-nav--public" : ""}`} aria-label="Navigasi peta IKM">
            {navigationTabs.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" aria-pressed={activeTab === id} className={`nav-item ${activeTab === id ? "is-active" : ""}`} onClick={() => setActiveTab(id)}>
                <Icon size={17} strokeWidth={1.9} /><span>{label}</span>
              </button>
            ))}
          </nav>

          <div className="sidebar-section-label"><span>FILTER DATA</span><Filter size={13} /></div>
          <label className="search-field">
            <Search size={16} />
            <input aria-label="Cari data atau desa" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari data atau desa…" />
            {query && <button type="button" onClick={() => setQuery("")} aria-label="Bersihkan pencarian"><X size={14} /></button>}
          </label>
          <label className="select-field">
            <Building2 size={16} />
            <select aria-label="Filter kecamatan" value={selectedDistrict} onChange={(event) => setSelectedDistrict(event.target.value)}>
              <option value="">Semua kecamatan</option>
              {districtOptions.map((district) => <option key={district} value={district}>{district}</option>)}
            </select>
            <ChevronDown size={15} />
          </label>

          <div className="sidebar-info">
            <div className="sidebar-info-icon"><ShieldCheck size={18} /></div>
            <div><strong>{isAdmin ? "Akses administrator" : "Data bersama"}</strong><p>{isAdmin ? "Anda dapat mengelola data bersama." : "Semua pengunjung dapat melihat; hanya admin yang dapat mengubah."}</p></div>
          </div>
          <div className="sidebar-foot">
            <span className="connection-indicator"><span className={supabase ? "is-connected" : ""} /> {supabase ? "Database terhubung" : "Belum terhubung"}</span>
            <span className="help-indicator" title="Lihat README.md untuk panduan setup" aria-label="Lihat README untuk panduan setup"><CircleHelp size={15} /></span>
          </div>
        </aside>

        <section className="main-content">
          <div className="page-heading">
            <div>
              <div className="breadcrumbs">Kabupaten Maluku Barat Daya <span>/</span> Data IKM</div>
              <h2>{activeTab === "villages" ? "Pilih desa" : tabs.find((tab) => tab.id === activeTab)?.label}</h2>
              <p>{activeTab === "dashboard" ? "Jelajahi jumlah IKM kecil dan menengah pada setiap desa." : activeTab === "villages" ? "Pilih desa untuk melihat jumlah IKM kecil dan menengah pada peta." : "Sebaran dan rekap IKM kecil serta menengah per desa."}</p>
            </div>
            <div className="heading-actions">
              <span className="sync-status"><Cloud size={15} /> {isAdmin ? "Admin · tersinkron" : "Data bersama · hanya lihat"}</span>
              {activeTab === "ikm" ? (
                <>
                  <button className="button button--quiet" onClick={downloadCsv}><ArrowDownToLine size={16} /> Ekspor CSV</button>
                  {isAdmin && <button className="button button--quiet" onClick={() => importInput.current?.click()} disabled={busy}><Upload size={16} /> {busy ? "Mengimpor…" : "Impor CSV"}</button>}
                  <input ref={importInput} type="file" accept=".csv,text/csv" onChange={(event) => void handleImportCsv(event)} hidden />
                </>
              ) : null}
              {isAdmin && activeTab === "ikm" && <button className="button button--primary" onClick={() => setEditor({ kind: "ikm", row: null })} disabled={busy}>
                <Plus size={17} /> Tambah data
              </button>}
            </div>
          </div>

          {!supabase && (
            <div className="setup-notice" role="status">
              <Database size={19} />
              <div><strong>Hubungkan Supabase untuk mulai menyimpan.</strong><p>Salin <code>.env.example</code> menjadi <code>.env.local</code>, isi URL dan anon key Supabase, lalu jalankan migrasi database.</p></div>
            </div>
          )}
          {supabase && authChecked && (!session || (adminChecked && !isAdmin)) && (
            <div className="setup-notice setup-notice--muted" role="status">
              <ShieldCheck size={19} />
              <div><strong>Data bersama dapat dilihat tanpa masuk.</strong><p>{session ? "Akun ini hanya memiliki akses lihat. Perubahan data hanya dapat dilakukan oleh admin." : "Masuk hanya diperlukan untuk akun admin yang mengelola data."}</p></div>
              {!session && <button className="button button--small button--primary" onClick={() => { setAuthMode("sign-in"); setShowAuth(true); setAuthMessage(""); }}>Masuk</button>}
            </div>
          )}

          <div className="summary-row">
            <article className="summary-card"><span className="summary-icon summary-icon--blue"><Store size={17} /></span><div><span className="summary-label">IKM kecil</span><strong>{numberFormat.format(ikmTotals.small)}</strong></div><small>usaha</small></article>
            <article className="summary-card"><span className="summary-icon summary-icon--green"><Store size={17} /></span><div><span className="summary-label">IKM menengah</span><strong>{numberFormat.format(ikmTotals.medium)}</strong></div><small>usaha</small></article>
            <article className="summary-card"><span className="summary-icon summary-icon--amber"><Building2 size={17} /></span><div><span className="summary-label">Desa terdata</span><strong>{numberFormat.format(reportingVillageCount)}</strong></div><small>dari 118 desa</small></article>
            <article className="summary-card"><span className="summary-icon summary-icon--purple"><MapPin size={17} /></span><div><span className="summary-label">Cakupan wilayah</span><strong>118 <small>desa</small></strong></div><small>17 kecamatan</small></article>
          </div>

          {activeTab === "dashboard" && (
            <div className="visitor-dashboard">
              <section className="dashboard-hero">
                <div className="dashboard-hero-copy">
                  <span className="dashboard-kicker"><span className="live-dot" /> PETA IKM KABUPATEN</span>
                  <h3>Industri kecil dan menengah Maluku Barat Daya</h3>
                  <p>Lihat sebaran dan jumlah IKM kecil serta menengah pada tiap desa di Kabupaten Maluku Barat Daya.</p>
                  <div className="dashboard-hero-actions">
                    <button className="button button--light" onClick={() => setActiveTab("map")}><MapPin size={16} /> Buka peta IKM</button>
                    <button className="dashboard-link" onClick={() => setActiveTab("ikm")}>Lihat data per desa <ArrowRight size={15} /></button>
                  </div>
                </div>
                <div className="dashboard-region" aria-label="Cakupan: 17 kecamatan dan 118 desa">
                  <span className="dashboard-region-count">17</span>
                  <strong>Kecamatan</strong>
                  <span className="dashboard-region-divider" />
                  <span className="dashboard-region-count">118</span>
                  <strong>Desa</strong>
                </div>
              </section>

              <div className="dashboard-grid">
                <section className="dashboard-card">
                  <header className="dashboard-card-head">
                    <div><h3>Jumlah IKM</h3><p>Rekap tahun terbaru pada tiap desa.</p></div>
                    <span className="dashboard-total">{numberFormat.format(ikmTotals.small + ikmTotals.medium)} usaha</span>
                  </header>
                  <div className="dashboard-bars">
                    {([
                      { key: "small", label: "Kecil", color: "small" },
                      { key: "medium", label: "Menengah", color: "medium" },
                    ] as const).map(({ key, label, color }) => {
                      const total = ikmTotals[key];
                      const allBusinesses = ikmTotals.small + ikmTotals.medium;
                      const share = allBusinesses > 0 ? (total / allBusinesses) * 100 : 0;
                      return (
                        <div className="dashboard-bar-row" key={key}>
                          <div className="dashboard-bar-label"><span><i className={`dashboard-bar-dot dashboard-bar-dot--${color}`} />{label}</span><strong>{numberFormat.format(total)}</strong></div>
                          <div className="dashboard-bar-track" role="img" aria-label={`${label}: ${numberFormat.format(total)} usaha, ${share.toFixed(1)} persen`}>
                            <span className={`dashboard-bar-fill dashboard-bar-fill--${color}`} style={{ width: `${share}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <footer className="dashboard-card-foot">{loadingData ? "Memuat data terbaru…" : `${numberFormat.format(latestIkm.length)} desa memiliki rekap IKM.`}</footer>
                </section>

                <section className="dashboard-card">
                  <header className="dashboard-card-head">
                    <div><h3>Cakupan pendataan</h3><p>Data yang tersedia per desa.</p></div>
                    <button className="dashboard-link dashboard-card-link" onClick={() => setActiveTab("map")}>Buka peta <ArrowRight size={15} /></button>
                  </header>
                  <div className="dashboard-economy">
                    <div><span>Desa terdata</span><strong>{numberFormat.format(latestIkm.length)} desa</strong></div>
                    <div><span>Wilayah administratif</span><strong>17 kecamatan</strong></div>
                    <div><span>Total desa</span><strong>118 desa</strong></div>
                  </div>
                  <footer className="dashboard-card-foot">Angka di peta mengikuti rekap terbaru per desa.</footer>
                </section>
              </div>

              <section className="dashboard-card dashboard-recent">
                <header className="dashboard-card-head">
                  <div><h3>Rekap IKM per desa</h3><p>Jumlah usaha kecil dan menengah yang terakhir dicatat.</p></div>
                  <button className="dashboard-link dashboard-card-link" onClick={() => setActiveTab("ikm")}>Semua data desa <ArrowRight size={15} /></button>
                </header>
                {latestIkmForDisplay.length > 0 ? (
                  <ul className="dashboard-recent-list">
                    {latestIkmForDisplay.map((row) => {
                      const village = villageByCode.get(row.village_code);
                      return (
                        <li key={row.id}>
                          <span className="dashboard-recent-icon"><Store size={16} /></span>
                          <span className="dashboard-recent-village"><strong>{village?.name ?? row.village_code}</strong><small>{village?.kecamatan ?? "Wilayah MBD"}</small></span>
                          <span className="dashboard-recent-total">{numberFormat.format(row.small)} kecil · {numberFormat.format(row.medium)} menengah</span>
                          <span className="dashboard-recent-year">Tahun {row.year}</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="dashboard-empty">{loadingData ? "Memuat rekap data…" : "Belum ada rekap IKM yang dapat ditampilkan."}</div>
                )}
              </section>
            </div>
          )}

          {activeTab === "villages" && isVisitor && (
            <section className="village-directory">
              <header className="village-directory-head">
                <div>
                  <h3>Pilih desa untuk melihat datanya</h3>
                  <p>Pilih desa untuk membuka peta pada wilayahnya dan melihat jumlah IKM kecil serta menengah.</p>
                </div>
                <span className="records-count">{numberFormat.format(visibleVillages.length)} desa</span>
              </header>
              {villages && visibleVillages.length > 0 ? (
                <div className="village-directory-grid">
                  {visibleVillages.map((village) => (
                    <button className="village-option" key={village.code} onClick={() => selectVillage(village)}>
                      <span className="village-option-icon"><Building2 size={17} /></span>
                      <span className="village-option-copy"><strong>{village.name}</strong><small>{village.kecamatan}</small></span>
                      <ArrowRight size={16} className="village-option-arrow" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <span className="empty-icon"><Search size={20} /></span>
                  <strong>{villages ? "Desa tidak ditemukan. Coba ubah pencarian atau filter kecamatan." : "Memuat daftar desa…"}</strong>
                </div>
              )}
            </section>
          )}

          {activeTab === "map" && (
            <>
            {isVisitor && selectedVillage && (
              <section className="village-detail" aria-labelledby="selected-village-title">
                <header className="village-detail-head">
                  <div>
                    <p className="eyebrow">RINGKASAN DESA</p>
                    <h3 id="selected-village-title">{selectedVillage.name}</h3>
                    <p>{selectedVillage.kecamatan} · {selectedVillage.areaKm2.toLocaleString("id-ID", { maximumFractionDigits: 2 })} km²</p>
                  </div>
                  <button className="button button--quiet button--small" onClick={() => setActiveTab("villages")}>Pilih desa lain</button>
                </header>
                <div className="village-metrics">
                  <article><span>IKM kecil</span><strong>{selectedVillageIkm ? numberFormat.format(selectedVillageIkm.small) : "—"}</strong><small>{selectedVillageIkm ? `Data ${selectedVillageIkm.year}` : "Belum ada data"}</small></article>
                  <article><span>IKM menengah</span><strong>{selectedVillageIkm ? numberFormat.format(selectedVillageIkm.medium) : "—"}</strong><small>{selectedVillageIkm ? `Data ${selectedVillageIkm.year}` : "Belum ada data"}</small></article>
                </div>
              </section>
            )}
            <div className="map-card">
              <div className="map-card-head">
                <div><div className="section-title"><span className="map-pulse" /> Peta sebaran IKM</div><p>Pilih pin desa untuk melihat jumlah IKM kecil dan menengah.</p></div>
                <div className="map-legend"><span><i className="legend-district" /> Batas wilayah</span><span><i className="legend-point legend-point--kecil" /> IKM kecil</span><span><i className="legend-point legend-point--menengah" /> IKM menengah</span></div>
              </div>
              <div className="map-frame">
                <MapCanvas villages={villages} ikm={villageMapIkm} villageByCode={villageByCode} selectedVillageCode={isVisitor ? selectedVillageCode : null} />
              </div>
              <div className="map-foot"><span><Layers3 size={15} /> Batas administrasi 17 kecamatan / 118 desa</span><span>Pin hanya ditampilkan untuk desa yang memiliki data IKM kecil atau menengah.</span></div>
            </div>
            </>
          )}

          {activeTab === "points" && (
            <DataCard title="Titik lapangan" description="Lokasi fasilitas, IKM, dan aktivitas ekonomi." count={visiblePoints.length} loading={loadingData} emptyText="Belum ada titik. Tambahkan titik pertama untuk memulai." canEdit={isAdmin} onAdd={() => setEditor({ kind: "point", row: null })}>
              <div className="data-table-wrap"><table><thead><tr><th>Nama titik</th><th>Desa / kecamatan</th><th>Kategori</th><th>Koordinat</th><th>Nilai</th>{isAdmin && <th>Aksi</th>}</tr></thead><tbody>
                {visiblePoints.map((point) => {
                  const village = villageByCode.get(point.village_code);
                  return <tr key={point.id}><td><strong>{point.name}</strong>{point.description && <small className="row-note">{point.description}</small>}</td><td>{village?.name ?? point.village_code}<small className="row-note">{village?.kecamatan}</small></td><td><span className={`category-pill category-pill--${point.category}`}>{categoryLabels[point.category]}</span></td><td className="coordinates">{point.lat.toFixed(5)}, {point.lng.toFixed(5)}</td><td>{point.value == null ? "—" : numberFormat.format(point.value)}</td>{isAdmin && <td><RowActions onEdit={() => setEditor({ kind: "point", row: point })} onDelete={() => void handleDelete("point", point.id)} /></td>}</tr>;
                })}
              </tbody></table></div>
            </DataCard>
          )}

          {activeTab === "ikm" && (
            <DataCard title="Data IKM per desa" description="Jumlah IKM kecil dan menengah pada rekap tahun terbaru setiap desa." count={visibleLatestIkm.length} loading={loadingData} emptyText="Belum ada data IKM. Tambahkan rekap desa untuk memulai." canEdit={isAdmin} onAdd={() => setEditor({ kind: "ikm", row: null })}>
              <div className="data-table-wrap"><table><thead><tr><th>Desa / kecamatan</th><th>Tahun</th><th>IKM kecil</th><th>IKM menengah</th><th>Total IKM</th><th>Sumber</th>{isAdmin && <th>Aksi</th>}</tr></thead><tbody>
                {visibleLatestIkm.map((row) => {
                  const village = villageByCode.get(row.village_code);
                  return <tr key={row.id}><td><strong>{village?.name ?? row.village_code}</strong><small className="row-note">{village?.kecamatan}</small></td><td>{row.year}</td><td>{numberFormat.format(row.small)}</td><td>{numberFormat.format(row.medium)}</td><td><strong>{numberFormat.format(row.small + row.medium)}</strong></td><td>{row.source || "—"}</td>{isAdmin && <td><RowActions onEdit={() => setEditor({ kind: "ikm", row })} onDelete={() => void handleDelete("ikm", row.id)} /></td>}</tr>;
                })}
              </tbody></table></div>
            </DataCard>
          )}

          {activeTab === "business-types" && isAdmin && (
            <DataCard title="Jumlah jenis usaha per desa" description="Jumlah usaha pada tujuh kategori untuk setiap desa dan tahun." count={visibleBusinessTypes.length} loading={loadingData} emptyText="Belum ada jumlah jenis usaha. Tambahkan rekap per desa." canEdit={isAdmin} onAdd={() => setEditor({ kind: "business-types", row: null })}>
              <div className="data-table-wrap"><table><thead><tr>
                <th>Desa / kecamatan</th><th>Tahun</th>
                {businessTypeFields.map(({ field, label }) => <th key={field}>{label}</th>)}
                <th>Total usaha</th><th>Sumber</th><th>Aksi</th>
              </tr></thead><tbody>
                {visibleBusinessTypes.map((row) => {
                  const village = villageByCode.get(row.village_code);
                  const total = businessTypeFields.reduce((sum, { field }) => sum + row[field], 0);
                  return (
                    <tr key={row.id}>
                      <td><strong>{village?.name ?? row.village_code}</strong><small className="row-note">{village?.kecamatan}</small></td>
                      <td>{row.year}</td>
                      {businessTypeFields.map(({ field }) => <td key={field}>{numberFormat.format(row[field])}</td>)}
                      <td><strong>{numberFormat.format(total)}</strong></td>
                      <td>{row.source || "—"}</td>
                      <td><RowActions onEdit={() => setEditor({ kind: "business-types", row })} onDelete={() => void handleDelete("business-types", row.id)} /></td>
                    </tr>
                  );
                })}
              </tbody></table></div>
            </DataCard>
          )}

          {activeTab === "economy" && (
            <DataCard title="Ekonomi desa" description="Omzet, tenaga kerja, dan investasi tercatat per desa." count={visibleEconomy.length} loading={loadingData} emptyText="Belum ada data ekonomi. Tambahkan catatan per desa." canEdit={isAdmin} onAdd={() => setEditor({ kind: "economy", row: null })}>
              <div className="data-table-wrap"><table><thead><tr><th>Desa / kecamatan</th><th>Omzet</th><th>Tenaga kerja</th><th>Investasi</th><th>Diperbarui</th>{isAdmin && <th>Aksi</th>}</tr></thead><tbody>
                {visibleEconomy.map((row) => {
                  const village = villageByCode.get(row.village_code);
                  return <tr key={row.id}><td><strong>{village?.name ?? row.village_code}</strong><small className="row-note">{village?.kecamatan}</small></td><td>{currency.format(row.turnover)}</td><td>{numberFormat.format(row.workers)}</td><td>{currency.format(row.investment)}</td><td>{new Date(row.updated_at).toLocaleDateString("id-ID")}</td>{isAdmin && <td><RowActions onEdit={() => setEditor({ kind: "economy", row })} onDelete={() => void handleDelete("economy", row.id)} /></td>}</tr>;
                })}
              </tbody></table></div>
            </DataCard>
          )}

          <footer className="page-footer"><span><ShieldCheck size={14} /> Data disimpan secara aman di Supabase</span><span>Sumber batas administrasi perlu dikonfirmasi sebelum pelaporan resmi.</span></footer>
        </section>
      </div>

      {editor && (
        <EditorModal
          editor={editor}
          villages={villages?.features.map((feature) => feature.properties) ?? []}
          villageGeoJson={villages}
          busy={busy}
          onClose={() => setEditor(null)}
          onSavePoint={handleSavePoint}
          onSaveIkm={handleSaveIkm}
          onSaveBusinessTypes={handleSaveBusinessTypes}
          onSaveEconomy={handleSaveEconomy}
        />
      )}
      {showAuth && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && authMode !== "new-password") setShowAuth(false); }}>
          <section className="dialog auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
            <header className="dialog-head"><div className="dialog-icon"><ShieldCheck size={20} /></div><button className="icon-button" onClick={() => { if (authMode !== "new-password") setShowAuth(false); }} disabled={authMode === "new-password"} aria-label="Tutup"><X size={18} /></button></header>
            {authMode === "sign-in" && (
              <>
                <h2 id="auth-title">Masuk dengan kata sandi</h2><p className="dialog-intro">Masuk menggunakan email dan kata sandi akun Anda.</p>
                <form onSubmit={handleSignIn} className="form-stack">
                  <label className="field"><span>Email</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nama@contoh.id" required /></label>
                  <label className="field"><span>Kata sandi</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
                  {authMessage && <p className="form-message" role="status">{authMessage}</p>}
                  <button className="button button--primary button--wide" type="submit" disabled={busy || !supabase}><LogIn size={16} />{busy ? "Memeriksa…" : "Masuk"}</button>
                </form>
                <button className="button button--quiet button--wide" type="button" onClick={() => { setAuthMode("reset-password"); setAuthMessage(""); }}>Lupa kata sandi?</button>
              </>
            )}
            {authMode === "reset-password" && (
              <>
                <h2 id="auth-title">Atur ulang kata sandi</h2><p className="dialog-intro">Masukkan email akun Anda. Kami akan mengirim tautan untuk membuat kata sandi baru.</p>
                <form onSubmit={handlePasswordReset} className="form-stack">
                  <label className="field"><span>Email</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nama@contoh.id" required /></label>
                  {authMessage && <p className="form-message" role="status">{authMessage}</p>}
                  <button className="button button--primary button--wide" type="submit" disabled={busy || !supabase}>{busy ? "Mengirim…" : "Kirim tautan atur ulang"}</button>
                </form>
                <button className="button button--quiet button--wide" type="button" onClick={() => { setAuthMode("sign-in"); setAuthMessage(""); }}>Kembali ke masuk</button>
              </>
            )}
            {authMode === "new-password" && (
              <>
                <h2 id="auth-title">Buat kata sandi baru</h2><p className="dialog-intro">Gunakan sedikitnya 8 karakter. Setelah disimpan, Anda akan masuk ke aplikasi.</p>
                <form onSubmit={handleUpdatePassword} className="form-stack">
                  <label className="field"><span>Kata sandi baru</span><input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label>
                  <label className="field"><span>Ulangi kata sandi baru</span><input type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>
                  {authMessage && <p className="form-message" role="status">{authMessage}</p>}
                  <button className="button button--primary button--wide" type="submit" disabled={busy || !supabase}>{busy ? "Menyimpan…" : "Simpan kata sandi"}</button>
                </form>
              </>
            )}
            <p className="privacy-note"><ShieldCheck size={14} /> RLS memastikan data hanya dapat diakses akun pemiliknya.</p>
          </section>
        </div>
      )}
      {toast && <div className={`toast toast--${toast.type}`} role="status">{toast.type === "success" ? <Check size={17} /> : <CircleHelp size={17} />}{toast.text}</div>}
    </main>
  );
}

function mergeRecordsById<T extends { id: string }>(current: T[], updates: T[]): T[] {
  const updatedIds = new Set(updates.map((record) => record.id));
  return [
    ...updates,
    ...current.filter((record) => !updatedIds.has(record.id)),
  ];
}

function latestByVillage<T extends { village_code: string; year: number }>(records: T[]): T[] {
  const latest = new Map<string, T>();
  for (const record of records) {
    const current = latest.get(record.village_code);
    if (!current || record.year > current.year) latest.set(record.village_code, record);
  }
  return [...latest.values()];
}

const dataPageSize = 1000;

async function loadAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const records: T[] = [];
  for (let from = 0; ; from += dataPageSize) {
    const { data, error } = await fetchPage(from, from + dataPageSize - 1);
    if (error) return { data: records, error };
    const page = data ?? [];
    records.push(...page);
    if (page.length < dataPageSize) return { data: records, error: null };
  }
}

function DataCard({
  title, description, count, loading, emptyText, canEdit, onAdd, children,
}: {
  title: string; description: string; count: number; loading: boolean; emptyText: string;
  canEdit: boolean; onAdd: () => void; children: React.ReactNode;
}) {
  const isEmpty = !loading && count === 0;
  return (
    <section className="records-card">
      <header className="records-head"><div><div className="section-title">{title}</div><p>{description}</p></div><span className="records-count">{count} catatan</span></header>
      {loading ? <div className="table-state">Memuat data tersinkron…</div> : isEmpty ? <div className="empty-state"><span className="empty-icon"><Database size={22} /></span><strong>{emptyText}</strong>{canEdit && <button className="button button--primary button--small" onClick={onAdd}><Plus size={15} /> Tambah data</button>}</div> : children}
    </section>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return <div className="row-actions"><button title="Edit" aria-label="Edit" onClick={onEdit}><Edit3 size={15} /></button><button title="Hapus" aria-label="Hapus" className="delete-action" onClick={onDelete}><Trash2 size={15} /></button></div>;
}

function EditorModal({
  editor, villages, busy, onClose, onSavePoint, onSaveIkm, onSaveBusinessTypes, onSaveEconomy,
  villageGeoJson,
}: {
  editor: Editor;
  villages: Village[];
  villageGeoJson: VillageCollection | null;
  busy: boolean;
  onClose: () => void;
  onSavePoint: (input: PointInput, id: string | null) => Promise<void>;
  onSaveIkm: (input: IkmInput, id: string | null) => Promise<void>;
  onSaveBusinessTypes: (input: IkmBusinessTypeInput, id: string | null) => Promise<void>;
  onSaveEconomy: (input: EconomyInput, id: string | null) => Promise<void>;
}) {
  const row = editor.row as MapPoint | IkmRecord | IkmBusinessTypeRecord | EconomyRecord | null;
  const [errors, setErrors] = useState<string[]>([]);
  const [villageCode, setVillageCode] = useState(row?.village_code ?? "");
  const editorLabel = editor.kind === "point"
    ? "titik lapangan"
    : editor.kind === "ikm"
      ? "data IKM"
      : editor.kind === "business-types"
        ? "jumlah jenis usaha"
        : "data ekonomi";
  const title = `${row ? "Edit" : "Tambah"} ${editorLabel}`;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (editor.kind === "point") {
      const parsed = pointSchema.safeParse({ ...values, village_code: villageCode });
      if (!parsed.success) return setErrors(parsed.error.issues.map((issue) => issue.message));
      const selectedVillage = villages.find((village) => village.code === parsed.data.village_code);
      if (!selectedVillage) return setErrors(["Pilih desa yang tersedia dari daftar."]);
      if (!isInsideMbd(parsed.data.lat, parsed.data.lng, villageGeoJson, parsed.data.village_code)) {
        return setErrors([`Koordinat harus berada di wilayah Desa ${selectedVillage.name}.`]);
      }
      setErrors([]);
      await onSavePoint(parsed.data, editor.row?.id ?? null);
      return;
    }
    if (editor.kind === "ikm") {
      const year = editor.row?.year ?? new Date().getFullYear();
      const parsed = ikmSchema.safeParse({
        ...values,
        village_code: villageCode,
        year,
        micro: editor.row?.micro ?? 0,
        description_micro: editor.row?.description_micro ?? "",
      });
      if (!parsed.success) return setErrors(parsed.error.issues.map((issue) => issue.message));
      setErrors([]);
      await onSaveIkm(parsed.data, editor.row?.id ?? null);
      return;
    }
    if (editor.kind === "business-types") {
      const parsed = ikmBusinessTypeSchema.safeParse({ ...values, village_code: villageCode });
      if (!parsed.success) return setErrors(parsed.error.issues.map((issue) => issue.message));
      setErrors([]);
      await onSaveBusinessTypes(parsed.data, editor.row?.id ?? null);
      return;
    }
    const year = editor.row?.year ?? new Date().getFullYear();
    const parsed = economySchema.safeParse({ ...values, village_code: villageCode, year });
    if (!parsed.success) return setErrors(parsed.error.issues.map((issue) => issue.message));
    setErrors([]);
    await onSaveEconomy(parsed.data, editor.row?.id ?? null);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="dialog editor-dialog" role="dialog" aria-modal="true" aria-labelledby="editor-title">
        <header className="dialog-head"><div><p className="eyebrow">DATA WILAYAH</p><h2 id="editor-title">{title}</h2></div><button className="icon-button" onClick={onClose} disabled={busy} aria-label="Tutup"><X size={18} /></button></header>
        <form className="form-stack" onSubmit={(event) => void submit(event)}>
          <label className="field"><span>Desa / kelurahan <b>*</b></span><select value={villageCode} onChange={(event) => setVillageCode(event.target.value)} required><option value="" disabled>Pilih desa</option>{villages.map((village) => <option key={village.code} value={village.code}>{village.name} · {village.kecamatan}</option>)}</select></label>
          {editor.kind === "point" && <PointFields row={editor.row} />}
          {editor.kind === "ikm" && <IkmFields row={editor.row} />}
          {editor.kind === "business-types" && <BusinessTypeFields row={editor.row} />}
          {editor.kind === "economy" && <EconomyFields row={editor.row} />}
          {errors.length > 0 && <div className="form-errors" role="alert">{errors.map((error, index) => <p key={`${index}-${error}`}>{error}</p>)}</div>}
          <div className="dialog-actions"><button type="button" className="button button--quiet" onClick={onClose} disabled={busy}>Batal</button><button type="submit" className="button button--primary" disabled={busy || villages.length === 0}>{busy ? "Menyimpan…" : "Simpan perubahan"}</button></div>
        </form>
      </section>
    </div>
  );
}

function PointFields({ row }: { row: MapPoint | null }) {
  return <>
    <label className="field"><span>Nama titik <b>*</b></span><input name="name" defaultValue={row?.name ?? ""} maxLength={100} placeholder="Contoh: Koperasi desa" required /></label>
    <label className="field"><span>Kategori</span><select name="category" defaultValue={row?.category ?? "mikro"}>{(Object.entries(categoryLabels) as [PointCategory, string][]).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
    <div className="field-grid"><label className="field"><span>Latitude <b>*</b></span><input name="lat" type="number" step="any" min="-10" max="-6" defaultValue={row?.lat ?? ""} placeholder="-8.17688" required /></label><label className="field"><span>Longitude <b>*</b></span><input name="lng" type="number" step="any" min="125" max="131" defaultValue={row?.lng ?? ""} placeholder="127.94251" required /></label></div>
    <div className="field-hint">Koordinat harus berada di dalam batas desa yang dipilih.</div>
    <label className="field"><span>Nilai / omzet (Rp)</span><input name="value" type="number" min="0" step="1" defaultValue={row?.value ?? ""} placeholder="Opsional" /></label>
    <label className="field"><span>Keterangan</span><textarea name="description" rows={3} maxLength={500} defaultValue={row?.description ?? ""} placeholder="Tambahkan catatan singkat…" /></label>
  </>;
}

function IkmFields({ row }: { row: IkmRecord | null }) {
  return <>
    <div className="field-grid"><label className="field"><span>IKM kecil</span><input name="small" type="number" min="0" step="1" defaultValue={row?.small ?? 0} required /></label><label className="field"><span>IKM menengah</span><input name="medium" type="number" min="0" step="1" defaultValue={row?.medium ?? 0} required /></label></div>
    <label className="field"><span>Sumber data</span><input name="source" maxLength={160} defaultValue={row?.source ?? ""} placeholder="Contoh: Pendataan desa" /></label>
    <label className="field"><span>Keterangan IKM kecil</span><textarea name="description_small" rows={3} maxLength={500} defaultValue={row?.description_small ?? ""} placeholder="Keterangan usaha kecil…" /></label>
    <label className="field"><span>Keterangan IKM menengah</span><textarea name="description_medium" rows={3} maxLength={500} defaultValue={row?.description_medium ?? ""} placeholder="Keterangan usaha menengah…" /></label>
  </>;
}

function BusinessTypeFields({ row }: { row: IkmBusinessTypeRecord | null }) {
  return <>
    <label className="field"><span>Tahun data <b>*</b></span><input name="year" type="number" min="2000" max="2100" step="1" defaultValue={row?.year ?? new Date().getFullYear()} required /></label>
    <div className="field-grid field-grid--three">
      {businessTypeFields.map(({ field, label }) => (
        <label className="field" key={field}>
          <span>{label}</span>
          <input name={field} type="number" min="0" step="1" defaultValue={row?.[field] ?? 0} required />
        </label>
      ))}
    </div>
    <label className="field"><span>Sumber data</span><input name="source" maxLength={160} defaultValue={row?.source ?? ""} placeholder="Contoh: Pendataan desa" /></label>
  </>;
}

function EconomyFields({ row }: { row: EconomyRecord | null }) {
  return <>
    <label className="field"><span>Omzet (Rp) <b>*</b></span><input name="turnover" type="number" min="0" step="1" defaultValue={row?.turnover ?? 0} required /></label>
    <div className="field-grid"><label className="field"><span>Tenaga kerja</span><input name="workers" type="number" min="0" step="1" defaultValue={row?.workers ?? 0} required /></label><label className="field"><span>Investasi (Rp)</span><input name="investment" type="number" min="0" step="1" defaultValue={row?.investment ?? 0} required /></label></div>
  </>;
}
