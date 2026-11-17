import { apiClient } from './client';
import { getShipments } from './shipments';
import { EventListOut } from '../types/api';

export async function getShipmentEvents(shipmentId: string): Promise<EventListOut> {
  return apiClient.get<EventListOut>(`/api/v1/shipments/${shipmentId}/events`);
}

export async function getAllEvents(): Promise<EventListOut> {
  // Theo api-v1.md, Backend cung cấp events theo từng lô hàng: /api/v1/shipments/{id}/events
  const shipments = await getShipments();
  const allEventsPromises = shipments.items.map((s) =>
    getShipmentEvents(s.id).catch(() => ({ items: [] }))
  );
  const results = await Promise.all(allEventsPromises);
  const combined = results.flatMap((r) => r.items);
  combined.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
  return { items: combined };
}
