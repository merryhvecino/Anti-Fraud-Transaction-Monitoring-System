import { apiClient } from './api';
import { Alert, AlertFilters, AlertUpdate, PaginatedResponse } from '../types';

class AlertService {
  async getAlerts(filters: AlertFilters = {}): Promise<PaginatedResponse<Alert>> {
    const queryString = apiClient.buildQueryString(filters);
    return await apiClient.get<PaginatedResponse<Alert>>(`/alerts?${queryString}`);
  }

  async getAlertById(id: number): Promise<{ alert: Alert }> {
    return await apiClient.get<{ alert: Alert }>(`/alerts/${id}`);
  }

  async updateAlert(id: number, update: AlertUpdate): Promise<{ alert: Alert }> {
    return await apiClient.put<{ alert: Alert }>(`/alerts/${id}`, update);
  }

  async createAlert(alertData: any): Promise<{ alert: Alert }> {
    return await apiClient.post<{ alert: Alert }>('/alerts', alertData);
  }

  async getAlertStats(timeframe: string = '24h'): Promise<any> {
    return await apiClient.get(`/alerts/dashboard/stats?timeframe=${timeframe}`);
  }
}

export const alertService = new AlertService();
