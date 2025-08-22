import { apiClient } from './api';
import { Transaction, TransactionFilters, PaginatedResponse } from '../types';

class TransactionService {
  async getTransactions(filters: TransactionFilters = {}): Promise<PaginatedResponse<Transaction>> {
    const queryString = apiClient.buildQueryString(filters);
    return await apiClient.get<PaginatedResponse<Transaction>>(`/transactions?${queryString}`);
  }

  async getTransactionById(id: number): Promise<{ transaction: Transaction }> {
    return await apiClient.get<{ transaction: Transaction }>(`/transactions/${id}`);
  }

  async getTransactionAnalytics(timeframe: string = '24h'): Promise<any> {
    return await apiClient.get(`/transactions/analytics/summary?timeframe=${timeframe}`);
  }

  async bulkImportTransactions(transactions: any[]): Promise<any> {
    return await apiClient.post('/transactions/bulk', { transactions });
  }
}

export const transactionService = new TransactionService();
