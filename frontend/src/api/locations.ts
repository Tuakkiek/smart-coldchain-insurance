import { apiClient } from './client';
import { LocationResolveOut } from '../types/api';

export async function resolveLocationInput(input: string): Promise<LocationResolveOut> {
  return apiClient.post<LocationResolveOut>('/api/v1/locations/resolve', { input });
}
