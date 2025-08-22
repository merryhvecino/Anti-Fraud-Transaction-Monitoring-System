/**
 * BaseApiService - Foundation class for all API services
 * 
 * This class provides:
 * - HTTP request methods (GET, POST, PUT, DELETE)
 * - Error handling and logging
 * - Authentication token management
 * - Request/response interceptors
 * 
 * Learn: Base classes provide common functionality that child classes inherit.
 * This reduces code duplication and ensures consistent behavior.
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalRecords: number;
    limit: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export class BaseApiService {
  protected client: AxiosInstance;
  protected baseURL: string;

  constructor(baseURL: string = '/api') {
    this.baseURL = baseURL;
    this.client = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  /**
   * Set up request and response interceptors
   * Learn: Interceptors allow us to modify requests/responses globally
   */
  private setupInterceptors(): void {
    // Request interceptor - adds authentication token
    this.client.interceptors.request.use(
      (config) => {
        const token = this.getAuthToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        
        // Log request in development
        if (process.env.NODE_ENV === 'development') {
          console.log(`🔄 ${config.method?.toUpperCase()} ${config.url}`, config.data);
        }
        
        return config;
      },
      (error) => {
        console.error('Request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor - handles common errors
    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        // Log successful response in development
        if (process.env.NODE_ENV === 'development') {
          console.log(`✅ ${response.config.method?.toUpperCase()} ${response.config.url}`, response.data);
        }
        
        return response;
      },
      (error) => {
        return this.handleResponseError(error);
      }
    );
  }

  /**
   * Handle response errors consistently
   * @param error - Axios error object
   */
  private handleResponseError(error: any): Promise<never> {
    console.error('API Error:', error);

    // Handle network errors
    if (!error.response) {
      const networkError = new Error('Network error. Please check your connection.');
      return Promise.reject(networkError);
    }

    // Handle authentication errors
    if (error.response.status === 401) {
      this.handleAuthenticationError();
      return Promise.reject(new Error('Authentication required. Please log in again.'));
    }

    // Handle server errors
    if (error.response.status >= 500) {
      return Promise.reject(new Error('Server error. Please try again later.'));
    }

    // Handle API errors with custom messages
    const errorMessage = error.response?.data?.error || 
                        error.response?.data?.message || 
                        `HTTP ${error.response.status}: ${error.response.statusText}`;
    
    return Promise.reject(new Error(errorMessage));
  }

  /**
   * Handle authentication errors (token expired, invalid, etc.)
   */
  private handleAuthenticationError(): void {
    // Remove invalid token
    localStorage.removeItem('af-tms-token');
    
    // Redirect to login page
    window.location.href = '/login';
  }

  /**
   * Get authentication token from localStorage
   */
  private getAuthToken(): string | null {
    return localStorage.getItem('af-tms-token');
  }

  /**
   * Generic GET request
   * @param url - API endpoint
   * @param config - Additional axios configuration
   */
  protected async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await this.client.get<ApiResponse<T>>(url, config);
      return this.extractData(response);
    } catch (error) {
      throw this.createServiceError('GET', url, error);
    }
  }

  /**
   * Generic POST request
   * @param url - API endpoint
   * @param data - Request payload
   * @param config - Additional axios configuration
   */
  protected async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await this.client.post<ApiResponse<T>>(url, data, config);
      return this.extractData(response);
    } catch (error) {
      throw this.createServiceError('POST', url, error);
    }
  }

  /**
   * Generic PUT request
   * @param url - API endpoint
   * @param data - Request payload
   * @param config - Additional axios configuration
   */
  protected async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await this.client.put<ApiResponse<T>>(url, data, config);
      return this.extractData(response);
    } catch (error) {
      throw this.createServiceError('PUT', url, error);
    }
  }

  /**
   * Generic DELETE request
   * @param url - API endpoint
   * @param config - Additional axios configuration
   */
  protected async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await this.client.delete<ApiResponse<T>>(url, config);
      return this.extractData(response);
    } catch (error) {
      throw this.createServiceError('DELETE', url, error);
    }
  }

  /**
   * Upload file with progress tracking
   * @param url - API endpoint
   * @param file - File to upload
   * @param onProgress - Progress callback
   */
  protected async uploadFile<T>(
    url: string, 
    file: File, 
    onProgress?: (progress: number) => void
  ): Promise<T> {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const config: AxiosRequestConfig = {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            onProgress(progress);
          }
        },
      };

      const response = await this.client.post<ApiResponse<T>>(url, formData, config);
      return this.extractData(response);
    } catch (error) {
      throw this.createServiceError('UPLOAD', url, error);
    }
  }

  /**
   * Download file
   * @param url - API endpoint
   * @param filename - Desired filename
   */
  protected async downloadFile(url: string, filename?: string): Promise<void> {
    try {
      const response = await this.client.get(url, {
        responseType: 'blob',
      });

      // Create download link
      const blob = new Blob([response.data]);
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename || 'download';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      throw this.createServiceError('DOWNLOAD', url, error);
    }
  }

  /**
   * Extract data from API response
   * @param response - Axios response
   */
  private extractData<T>(response: AxiosResponse<ApiResponse<T>>): T {
    if (response.data.success === false) {
      throw new Error(response.data.error || 'API request failed');
    }
    
    return response.data.data as T;
  }

  /**
   * Create a standardized service error
   * @param method - HTTP method
   * @param url - API endpoint
   * @param error - Original error
   */
  private createServiceError(method: string, url: string, error: any): Error {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const serviceError = new Error(`${method} ${url}: ${message}`);
    
    // Preserve original error properties
    if (error.response) {
      (serviceError as any).status = error.response.status;
      (serviceError as any).statusText = error.response.statusText;
    }
    
    return serviceError;
  }

  /**
   * Build query string from parameters object
   * @param params - Parameters object
   */
  protected buildQueryString(params: Record<string, any>): string {
    const searchParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        if (Array.isArray(value)) {
          value.forEach(item => searchParams.append(key, item.toString()));
        } else {
          searchParams.append(key, value.toString());
        }
      }
    });
    
    const queryString = searchParams.toString();
    return queryString ? `?${queryString}` : '';
  }

  /**
   * Create a new instance with different configuration
   * @param config - Configuration options
   */
  static create(config: { baseURL?: string } = {}): BaseApiService {
    return new BaseApiService(config.baseURL);
  }

  /**
   * Get service statistics (for monitoring)
   */
  getStats(): {
    baseURL: string;
    hasAuthToken: boolean;
    defaultTimeout: number;
  } {
    return {
      baseURL: this.baseURL,
      hasAuthToken: !!this.getAuthToken(),
      defaultTimeout: this.client.defaults.timeout || 0
    };
  }
}

export default BaseApiService;
