export type RealtimeChannelName =
  | "flood_reports"
  | "help_requests"
  | "relief_centers"
  | "volunteer_assignments";

export type RealtimeEvent<TPayload> = {
  channel: RealtimeChannelName;
  payload: TPayload;
  receivedAt: string;
};

export function createLocalRealtimeEvent<TPayload>(
  channel: RealtimeChannelName,
  payload: TPayload
): RealtimeEvent<TPayload> {
  return {
    channel,
    payload,
    receivedAt: new Date().toISOString()
  };
}
