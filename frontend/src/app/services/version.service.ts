import { Injectable } from '@angular/core';
import axios from 'axios';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class VersionService {
  private BASE_URL = environment.apiUrl;

  // Come SetupService: axios diretto, fuori dall'interceptor auth-error
  // (endpoint pubblico, nessun token da invalidare su errore).
  async getVersion(): Promise<string> {
    try {
      const response = await axios.get(`${this.BASE_URL}/health/version`);
      return response.data?.version ?? 'dev';
    } catch (error) {
      return 'dev';
    }
  }
}
