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

  // reason: registra uscita o scadenza nel log accessi (finché il token è
  // valido). Senza reason (401: token già non valido) nessuna chiamata.
  logout(reason?: 'LOGOUT' | 'TIMEOUT'): void {
    const token = this.getToken();
    if (reason && token) {
      axios.post(`${this.BASE_URL}/authModule/logout`, { reason }, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => undefined);
    }
    sessionStorage.removeItem(this.TOKEN_KEY);
    sessionStorage.removeItem('auth_user');
    this.currentUserSubject.next(null);
  }

  // Rinnovo del token durante la sessione (il token dura 1 ora). false = il
  // backend ha rifiutato (utente cancellato/disattivato o token scaduto).
  async refresh(): Promise<boolean> {
    const token = this.getToken();
    if (!token) return true;
    try {
      const response = await axios.post(`${this.BASE_URL}/authModule/refresh`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const next = response.data?.access_token;
      if (next) sessionStorage.setItem(this.TOKEN_KEY, next);
      return true;
    } catch (error) {
      // Solo un rifiuto esplicito chiude la sessione: un errore di rete
      // momentaneo riprova al giro successivo.
      return !(axios.isAxiosError(error) && error.response?.status === 401);
    }
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
