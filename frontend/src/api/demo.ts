import { apiClient } from './client';
import { DemoScenarioOut, DemoScenarioPayload } from '../types/api';

export async function triggerDemoScenario(
  shipmentId: string,
  payload: DemoScenarioPayload
): Promise<DemoScenarioOut> {
  return apiClient.post<DemoScenarioOut>(`/api/v1/demo/shipments/${shipmentId}/scenario`, payload);
}
