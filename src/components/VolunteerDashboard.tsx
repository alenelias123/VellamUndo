"use client";

import { useState } from "react";
import { CheckCircle2, ClipboardList, PlayCircle, UserCheck } from "lucide-react";
import { helpTypeMeta, priorityMeta, sortHelpRequests, statusMeta } from "@/lib/helpRequests";
import type { HelpRequest, HelpStatus } from "@/lib/types";

type VolunteerDashboardProps = {
  requests: HelpRequest[];
  onUpdateStatus: (requestId: string, status: HelpStatus, assignedVolunteer?: string) => void;
};

export function VolunteerDashboard({ requests, onUpdateStatus }: VolunteerDashboardProps) {
  const [volunteerName, setVolunteerName] = useState("Team East-1");
  const sortedRequests = sortHelpRequests(requests);

  return (
    <section className="panel-stack" aria-label="Volunteer dashboard">
      <div className="panel-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Volunteer ops</p>
            <h2>Dispatch board</h2>
          </div>
          <ClipboardList size={20} />
        </div>

        <label>
          Active volunteer or team
          <input value={volunteerName} onChange={(event) => setVolunteerName(event.target.value)} />
        </label>
      </div>

      <div className="request-board">
        {sortedRequests.map((request) => (
          <article className={`request-card request-card--${request.priority}`} key={request.id}>
            <div className="request-card-header">
              <span
                className="priority-block"
                style={{
                  color: priorityMeta[request.priority].color,
                  background: priorityMeta[request.priority].background
                }}
              >
                {priorityMeta[request.priority].label}
              </span>
              <span className="status-label">{statusMeta[request.status].label}</span>
            </div>
            <h3>{helpTypeMeta[request.type].label}</h3>
            <p>{request.description}</p>
            <div className="metric-row">
              <span>{request.locationName}</span>
              <span>{request.peopleCount} people</span>
            </div>
            {request.assignedVolunteer ? (
              <p className="muted">Assigned to {request.assignedVolunteer}</p>
            ) : null}
            <div className="action-row">
              <button
                type="button"
                onClick={() => onUpdateStatus(request.id, "assigned", volunteerName)}
                disabled={request.status !== "open"}
              >
                <UserCheck size={16} />
                Accept
              </button>
              <button
                type="button"
                onClick={() => onUpdateStatus(request.id, "in-progress", volunteerName)}
                disabled={request.status === "completed"}
              >
                <PlayCircle size={16} />
                Start
              </button>
              <button
                type="button"
                onClick={() => onUpdateStatus(request.id, "completed", volunteerName)}
                disabled={request.status === "completed"}
              >
                <CheckCircle2 size={16} />
                Done
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
