import { Injectable } from '@angular/core';
import axios from 'axios';
import { environment } from '../../environments/environment';
import { BehaviorSubject } from 'rxjs';

export interface LoggedUser {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  id: number;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private TOKEN_KEY = 'auth_token';
  private BASE_URL = environment.apiUrl;
  public message_error = '';

  private currentUserSubject = new BehaviorSubject<LoggedUser | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor() {

    const token = sessionStorage.getItem(this.TOKEN_KEY);
    const userData = sessionStorage.getItem('auth_user');

    if (token && userData) {
      this.currentUserSubject.next(JSON.parse(userData));
    } 

  }

  async login(username: string, password: string): Promise<boolean> {
    try {
      const response = await axios.post(`${this.BASE_URL}/authModule/login`, {
        email: username,
        password
      });

      if(response.data.status == 'error_deleted'){
        this.message_error = 'Utente disattivato';
        return false;
      }

      const token = response.data?.token?.access_token;
      const userData: LoggedUser = response.data?.user;
      if (token) {
        sessionStorage.setItem(this.TOKEN_KEY, token);
        sessionStorage.setItem('auth_user', JSON.stringify(userData));
        this.currentUserSubject.next(userData);
        return true;
      }

      return false;
    } catch (error) {
      
      return false;
    }
  }

  logout(): void {
    sessionStorage.removeItem(this.TOKEN_KEY);
    sessionStorage.removeItem('auth_user');
    this.currentUserSubject.next(null);
  }

  get authenticated(): boolean {
    const token = sessionStorage.getItem(this.TOKEN_KEY);
    return !!token;
  }

  getToken(): string | null {
    return sessionStorage.getItem(this.TOKEN_KEY);
  }

  async generateOtp(email: string): Promise<boolean> {
    try {
      const response = await axios.post(`${this.BASE_URL}/authModule/generate-otp`, { email });
      return response.data?.status === 'ok';
    } catch (error) {
      console.error('Generate OTP error:', error);
      return false;
    }
  }

  async resetPassword(email: string, otp: string, newPassword: string): Promise<boolean> {
    try {
      const response = await axios.post(`${this.BASE_URL}/authModule/reset-password`, {
        email,
        otp,
        newPassword,
      });
      return response.data?.status === 'ok';
    } catch (error) {
      console.error('Reset password error:', error);
      return false;
    }
  }

  getCurrentUser(): LoggedUser | null {
    return this.currentUserSubject.value;
  }
}
