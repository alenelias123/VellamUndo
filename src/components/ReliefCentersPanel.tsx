"use client";

import { useMemo, useState } from "react";
import { Building2, MapPin, Phone, UsersRound } from "lucide-react";
import { districts } from "@/lib/districts";
import {
  getAvailableCapacity,
  reliefCenterTypeMeta,
  sortReliefCenters
} from "@/lib/reliefCenters";
import type { ReliefCenter, ReliefCenterType } from "@/lib/types";

type ReliefCentersPanelProps = {
  centers: ReliefCenter[];
  activeDistrictSlug: string;
};

const allTypes = Object.keys(reliefCenterTypeMeta) as ReliefCenterType[];

export function ReliefCentersPanel({ centers, activeDistrictSlug }: ReliefCentersPanelProps) {
  const [typeFilter, setTypeFilter] = useState<ReliefCenterType | "all">("all");
  const [districtFilter, setDistrictFilter] = useState(activeDistrictSlug);

  const filteredCenters = useMemo(() => {
    return sortReliefCenters(
      centers.filter((center) => {
        const matchesType = typeFilter === "all" || center.type === typeFilter;
        const matchesDistrict = districtFilter === "all" || center.district === districtFilter;
        return matchesType && matchesDistrict;
      })
    );
  }, [centers, districtFilter, typeFilter]);

  return (
    <section className="panel-stack" aria-label="Relief centers">
      <div className="panel-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Shelter network</p>
            <h2>Relief centers</h2>
          </div>
          <Building2 size={21} />
        </div>

        <div className="filter-grid">
          <label>
            District
            <select value={districtFilter} onChange={(event) => setDistrictFilter(event.target.value)}>
              <option value="all">All Kerala</option>
              {districts.map((district) => (
                <option key={district.slug} value={district.slug}>
                  {district.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Type
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as ReliefCenterType | "all")}
            >
              <option value="all">All services</option>
              {allTypes.map((type) => (
                <option key={type} value={type}>
                  {reliefCenterTypeMeta[type].label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="center-list">
        {filteredCenters.map((center) => {
          const typeMeta = reliefCenterTypeMeta[center.type];
          const available = getAvailableCapacity(center);
          const occupancyPercent = Math.round((center.occupancy / center.capacity) * 100);

          return (
            <article className="center-card" key={center.id}>
              <div className="center-card-header">
                <span
                  className="status-pill"
                  style={{ color: typeMeta.color, background: typeMeta.background }}
                >
                  {typeMeta.label}
                </span>
                <span>{available} available</span>
              </div>
              <h3>{center.name}</h3>
              <p className="muted">
                <MapPin size={14} />
                {center.address}
              </p>
              <div className="capacity-bar" aria-label={`${occupancyPercent}% occupied`}>
                <span style={{ width: `${Math.min(100, occupancyPercent)}%` }} />
              </div>
              <div className="metric-row">
                <span>
                  <UsersRound size={14} />
                  {center.occupancy}/{center.capacity}
                </span>
                <span>
                  <Phone size={14} />
                  {center.contact}
                </span>
              </div>
              <div className="supply-list">
                {center.supplies.map((supply) => (
                  <span key={supply}>{supply}</span>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
