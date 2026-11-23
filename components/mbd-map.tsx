"use client";

import { useEffect } from "react";
import * as L from "leaflet";
import { GeoJSON, MapContainer, Marker, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { Feature, Geometry } from "geojson";
import type { IkmRecord } from "@/lib/database.types";
import { type VillageCollection, type VillageProperties } from "@/lib/validation";

interface MapCanvasProps {
  villages: VillageCollection | null;
  ikm: IkmRecord[];
  villageByCode: ReadonlyMap<string, VillageProperties>;
  selectedVillageCode?: string | null;
}

const ikmCategories = [
  { field: "small", descriptionField: "description_small", category: "kecil", label: "Kecil", offset: -8 },
  { field: "medium", descriptionField: "description_medium", category: "menengah", label: "Menengah", offset: 8 },
] as const;

function FitMbdBounds({
  villages,
  selectedVillageCode,
}: {
  villages: VillageCollection | null;
  selectedVillageCode: string | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (!villages || villages.features.length === 0) return;
    const selectedVillage = selectedVillageCode
      ? villages.features.find((feature) => feature.properties.code === selectedVillageCode)
      : undefined;
    const layer = L.geoJSON(selectedVillage ?? villages);
    const bounds = layer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [28, 28], maxZoom: selectedVillage ? 13 : 10 });
  }, [map, selectedVillageCode, villages]);
  return null;
}

export default function MbdMap({
  villages,
  ikm,
  villageByCode,
  selectedVillageCode = null,
}: MapCanvasProps) {
  const latestIkmByVillage = new Map<string, IkmRecord>();
  for (const record of ikm) {
    const current = latestIkmByVillage.get(record.village_code);
    if (!current || record.year > current.year) latestIkmByVillage.set(record.village_code, record);
  }

  return (
    <MapContainer
      center={[-8.15, 127.9]}
      zoom={8}
      minZoom={7}
      maxZoom={18}
      scrollWheelZoom
      zoomControl
      preferCanvas
      className="leaflet-map"
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
        maxZoom={19}
      />
      {villages && (
        <>
          <GeoJSON
            key={selectedVillageCode ? `mbd-villages-${selectedVillageCode}` : "mbd-villages"}
            data={villages}
            style={(feature) => {
              const isSelected = (feature as Feature<Geometry, VillageProperties> | undefined)?.properties.code === selectedVillageCode;
              return {
                color: isSelected ? "#126f5d" : "#238877",
                weight: isSelected ? 2.4 : 1.15,
                opacity: 0.9,
                fillColor: districtColor((feature as Feature<Geometry, VillageProperties> | undefined)?.properties.kecCode ?? ""),
                fillOpacity: isSelected ? 0.42 : 0.24,
              };
            }}
            onEachFeature={(feature, layer) => {
              const properties = feature.properties as VillageProperties;
              layer.bindTooltip(`${properties.name} · ${properties.kecamatan}`, { sticky: true });
            }}
          />
          <FitMbdBounds villages={villages} selectedVillageCode={selectedVillageCode} />
        </>
      )}

      {[...latestIkmByVillage.values()].flatMap((record) => {
        const village = villageByCode.get(record.village_code);
        if (!village) return [];
        return ikmCategories
          .filter(({ field }) => record[field] > 0)
          .map(({ field, descriptionField, category, label, offset }) => (
            <Marker
              key={`ikm-${record.village_code}-${category}`}
              position={village.label}
              icon={ikmIcon(category, offset)}
              zIndexOffset={offset}
            >
              <Tooltip direction="top">{village.name} · IKM {label}</Tooltip>
              
              <Popup>
                <div style={{ fontFamily: 'sans-serif' }}>
                  <strong>IKM {label} · {new Intl.NumberFormat("id-ID").format(record[field])} usaha</strong>
                  <br />{village.name} · {village.kecamatan}
                  <br />Tahun data: {record.year}
                  {record[descriptionField] && <><br /><span className="ikm-map-description">{record[descriptionField]}</span></>}
                  {/* Tidak ada tombol Hapus atau Edit di sini untuk pengunjung */}
                </div>
              </Popup>
            </Marker>
          ));
      })}
    </MapContainer>
  );
}

function districtColor(code: string): string {
  const colors = ["#55b6a5", "#f0bf75", "#93aee8", "#db95b6", "#9dca8b", "#bb9be1"];
  let hash = 0;
  for (let index = 0; index < code.length; index += 1) hash = (hash * 31 + code.charCodeAt(index)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

function ikmIcon(category: "kecil" | "menengah", horizontalOffset = 0): L.DivIcon {
  return L.divIcon({
    className: `point-marker-icon point-marker-icon--${category}`,
    html: "<span></span>",
    iconSize: [18, 18],
    iconAnchor: [9 - horizontalOffset, 9],
  });
}