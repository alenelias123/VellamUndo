"use client";

import { FormEvent, useMemo, useState } from "react";
import { LifeBuoy, Send } from "lucide-react";
import { findDistrictForCoordinates, getDistrictBySlug } from "@/lib/districts";
import { helpTypeMeta, priorityMeta, type NewHelpRequestInput } from "@/lib/helpRequests";
import type { Coordinates, HelpPriority, HelpRequest, HelpType } from "@/lib/types";

type HelpRequestPanelProps = {
  activeDistrictSlug: string;
  pendingLocation?: Coordinates;
  requests: HelpRequest[];
  onSubmit: (input: NewHelpRequestInput) => HelpRequest;
};

const helpTypes = Object.keys(helpTypeMeta) as HelpType[];
const priorities: HelpPriority[] = ["low", "medium", "high", "critical"];

export function HelpRequestPanel({
  activeDistrictSlug,
  pendingLocation,
  requests,
  onSubmit
}: HelpRequestPanelProps) {
  const activeDistrict = getDistrictBySlug(activeDistrictSlug);
  const [requesterName, setRequesterName] = useState("");
  const [contact, setContact] = useState("");
  const [locationName, setLocationName] = useState("");
  const [type, setType] = useState<HelpType>("rescue");
  const [priority, setPriority] = useState<HelpPriority>("high");
  const [peopleCount, setPeopleCount] = useState(1);
  const [description, setDescription] = useState("");

  const submitLocation = pendingLocation ?? activeDistrict.center;
  const inferredDistrict = useMemo(
    () => findDistrictForCoordinates(submitLocation.lat, submitLocation.lng),
    [submitLocation.lat, submitLocation.lng]
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    onSubmit({
      requesterName: requesterName.trim() || "Anonymous requester",
      contact: contact.trim() || "Control room",
      district: inferredDistrict.slug,
      locationName: locationName.trim() || inferredDistrict.name,
      coordinates: submitLocation,
      type,
      priority,
      peopleCount,
      description: description.trim() || helpTypeMeta[type].description,
      assignedVolunteer: undefined
    });

    setRequesterName("");
    setContact("");
    setLocationName("");
    setType("rescue");
    setPriority("high");
    setPeopleCount(1);
    setDescription("");
  }

  return (
    <section className="panel-stack" aria-label="Emergency help requests">
      <div className="panel-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Emergency desk</p>
            <h2>Request help</h2>
          </div>
          <LifeBuoy size={20} />
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Name
            <input
              value={requesterName}
              onChange={(event) => setRequesterName(event.target.value)}
              placeholder="Requester name"
            />
          </label>

          <label>
            Contact
            <input
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              placeholder="Phone or radio ID"
            />
          </label>

          <label className="span-2">
            Location
            <input
              value={locationName}
              onChange={(event) => setLocationName(event.target.value)}
              placeholder="House, ward, school, junction"
            />
          </label>

          <label>
            Need
            <select value={type} onChange={(event) => setType(event.target.value as HelpType)}>
              {helpTypes.map((option) => (
                <option key={option} value={option}>
                  {helpTypeMeta[option].label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Priority
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value as HelpPriority)}
            >
              {priorities.map((option) => (
                <option key={option} value={option}>
                  {priorityMeta[option].label}
                </option>
              ))}
            </select>
          </label>

          <label>
            People
            <input
              type="number"
              min={1}
              max={200}
              value={peopleCount}
              onChange={(event) => setPeopleCount(Number(event.target.value))}
            />
          </label>

          <div className="coordinate-chip">
            {submitLocation.lat.toFixed(4)}, {submitLocation.lng.toFixed(4)}
          </div>

          <label className="span-2">
            Notes
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Urgency, medical details, access route, hazards"
            />
          </label>

          <button className="primary-action span-2" type="submit">
            <Send size={18} />
            Create request
          </button>
        </form>
      </div>

      <div className="panel-section compact-list">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Queue</p>
            <h2>Open requests</h2>
          </div>
          <span className="count-badge">
            {requests.filter((request) => request.status !== "completed").length}
          </span>
        </div>
        {requests
          .filter((request) => request.status !== "completed")
          .slice(0, 6)
          .map((request) => (
            <div className="help-row" key={request.id}>
              <span
                className="priority-block"
                style={{
                  color: priorityMeta[request.priority].color,
                  background: priorityMeta[request.priority].background
                }}
              >
                {priorityMeta[request.priority].label}
              </span>
              <span>
                <strong>{helpTypeMeta[request.type].label}</strong>
                <small>
                  {request.locationName} · {request.peopleCount} people
                </small>
              </span>
            </div>
          ))}
      </div>
    </section>
  );
}
