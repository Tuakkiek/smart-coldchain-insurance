import { apiClient } from './client';
import { mockAdapter } from '../mocks/mockAdapter';
import { DemoScenarioOut, DemoScenarioPayload } from '../types/api';

export async function triggerDemoScenario(
  shipmentId: string,
  payload: DemoScenarioPayload
): Promise<DemoScenarioOut> {
  if (apiClient.isMockEnabled()) {
    return mockAdapter.runDemoScenario(shipmentId, payload);
  }
  return apiClient.post<DemoScenarioOut>(`/api/v1/demo/shipments/${shipmentId}/scenario`, payload);
}

