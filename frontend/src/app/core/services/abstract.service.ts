import {HttpClient, HttpHeaders, HttpParams} from '@angular/common/http';
import {inject} from '@angular/core';
import {AuthService, LoggedUser} from '../../services/auth.service';
import {instanceToPlain, plainToInstance} from 'class-transformer';
import {AbstractEntity} from '../entities/abstract.entity';
import {map, Observable} from 'rxjs';

export abstract class AbstractService<T extends AbstractEntity> {
  protected auth = inject(AuthService);
  protected http = inject(HttpClient);
  protected abstract readonly BASE_URL: string;
  protected abstract readonly entityClass: any;

  user: LoggedUser | null = this.auth.getCurrentUser();

  protected getAuthHeaders(): HttpHeaders {
    const token = this.auth.getToken();
    return new HttpHeaders(
      {
        Authorization: `Bearer ${token || ''}`
      });
  }

  fromPlain(data: any[]): T[] {
    return plainToInstance(this.entityClass as any, data) as T[];
  }

  search(filters?: Partial<T>): Observable<T[]> {
    let params = new HttpParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") params = params.set(key, value as any);
      });
    }
    return this.http.get<any[]>(this.BASE_URL, {headers: this.getAuthHeaders(), params}).pipe(
      map(data => plainToInstance(this.entityClass as any, data) as T[])
    );
  }

  getById(id: number): Observable<T> {
    return this.http.get<any>(`${this.BASE_URL}/${id}`, {headers: this.getAuthHeaders()}).pipe(
      map(data => plainToInstance(this.entityClass as any, data) as unknown as T)
    );
  }

  create(entity: Partial<T>): Observable<T> {
    const plainEntity = this.parseCreate(entity);
    return this.http.post<any>(this.BASE_URL, plainEntity, {headers: this.getAuthHeaders()}).pipe(
      map(data => plainToInstance(this.entityClass as any, data) as unknown as T)
    );
  }

  update(id: number | null, entity: Partial<T>): Observable<T> {
    const plainEntity = this.parseUpdate(entity);
    return this.http.patch<any>(`${this.BASE_URL}/${id}`, plainEntity, {headers: this.getAuthHeaders()}).pipe(
      map(data => plainToInstance(this.entityClass as any, data) as unknown as T)
    );
  }

  count(filters?: Partial<T>): Observable<number> {
    let params = new HttpParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') params = params.set(key, value as any);
      });
    }
    return this.http.get<number>(`${this.BASE_URL}/counter`, {headers: this.getAuthHeaders(), params});
  }

  delete(id: number): Observable<void> {
    const body = this.parseDelete();
    return this.http.delete<void>(`${this.BASE_URL}/${id}`, {
      headers: this.getAuthHeaders(),
      body: body
    });
  }

  protected parseCreate(entity: Partial<T>): Record<string, any> {
    const entityInstance = plainToInstance(this.entityClass, entity);
    const user = this.auth.getCurrentUser();

    (entityInstance as any).created_by_user_id = user?.id;
    (entityInstance as any).updated_by_user_id = user?.id;

    return instanceToPlain(entityInstance);
  }

  protected parseUpdate(entity: Partial<T>): Record<string, any> {
    entity.updated_by_user_id = this.auth.getCurrentUser()?.id;
    const entityInstance = plainToInstance(this.entityClass, entity);
    return instanceToPlain(entityInstance);
  }

  protected parseDelete(): any {
    const user = this.auth.getCurrentUser();
    return {
      updated_by_user_id: user?.id
    };
  }
}
