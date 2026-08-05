import { Injectable } from '@angular/core';
import axios from 'axios';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SetupService {
  private BASE_URL = environment.apiUrl;

  async getStatus(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.BASE_URL}/setup/status`);
      return response.data?.available === true;
    } catch (error) {
      return false;
    }
  }

  async requestOtp(email: string, firstName: string, lastName: string, password: string, bootstrapToken: string): Promise<boolean> {
    try {
      const response = await axios.post(`${this.BASE_URL}/setup/request-otp`, {
        email, firstName, lastName, password, bootstrapToken
      });
      return response.data?.status === 'ok';
    } catch (error) {
      return false;
    }
  }

  async verifyOtp(email: string, otp: string): Promise<boolean> {
    try {
      const response = await axios.post(`${this.BASE_URL}/setup/verify`, { email, otp });
      return response.data?.status === 'ok';
    } catch (error) {
      return false;
    }
  }
}
