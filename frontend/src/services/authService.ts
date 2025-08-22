import { apiClient } from './api';
import { LoginRequest, LoginResponse, User } from '../types';

class AuthService {
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    return await apiClient.post<LoginResponse>('/auth/login', credentials);
  }

  async logout(): Promise<void> {
    await apiClient.post('/auth/logout');
  }

  async getCurrentUser(): Promise<User> {
    const response = await apiClient.get<{ user: User }>('/auth/me');
    return response.user;
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await apiClient.post('/auth/change-password', {
      currentPassword,
      newPassword,
    });
  }

  async registerUser(userData: {
    username: string;
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role?: string;
    department?: string;
  }): Promise<{ user: User }> {
    return await apiClient.post<{ user: User }>('/auth/register', userData);
  }
}

export const authService = new AuthService();
