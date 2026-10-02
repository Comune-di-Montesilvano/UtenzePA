import {inject, Injectable} from '@angular/core';
import {ComponentType} from '@angular/cdk/portal';
import {MatDialog} from '@angular/material/dialog';
import {catchError, from, map, Observable, of, switchMap} from 'rxjs';
import {openSheet} from '../components/entity-sheet/sheet-utils';
import {EditDialogData} from '../components/abstract-data-table.component';
import {AuthService} from '../../services/auth.service';
import {AssetService} from '../../pages/assets/asset.service';
import {Asset} from '../../pages/assets/entity/asset.entity';
import {UtilityService} from '../../pages/utilities/utility.service';
import {Utility} from '../../pages/utilities/entity/utility.entity';
import {ContractsService} from '../../pages/contracts/contract.service';
import {Contract} from '../../pages/contracts/entity/contract.entity';
import {UtilizerGrantService} from '../../pages/utilizer-grant/utilizer-grant.service';
import {UtilizerGrant} from '../../pages/utilizer-grant/entity/utilizer-grant.entity';

// Import dinamici: i dialog iniettano questo servizio, un import statico dei
// dialog qui creerebbe un ciclo di moduli.
const ASSET_DIALOG = () => import('../../pages/assets/asset-edit-dialog.component').then(m => m.AssetEditDialogComponent);
const UTILITY_DIALOG = () => import('../../pages/utilities/utility-edit-dialog.component').then(m => m.UtilityEditDialogComponent);
const PLANT_DIALOG = () => import('../../pages/plants/plant-edit-dialog.component').then(m => m.PlantEditDialogComponent);
const CONTRACT_DIALOG = () => import('../../pages/contracts/contract-edit-dialog.component').then(m => m.ContractEditDialogComponent);
const GRANT_DIALOG = () => import('../../pages/utilizer-grant/utilizer-grant-edit-dialog.component').then(m => m.UtilizerGrantEditDialogComponent);

// Apre le schede collegate (impilate sopra quella corrente) e persiste il
// risultato dove il dialog non salva da sé (immobile, utenza, contratti: la
// persistenza normalmente la fa la tabella via onSave/onCreate). Carica
// sempre il record completo: findAll() non joina le stesse relazioni di
// findOne(), aprire con la riga di una lista darebbe dati bucati.
@Injectable({providedIn: 'root'})
export class EntityNavigatorService {
  private dialog = inject(MatDialog);
  private auth = inject(AuthService);
  private assets = inject(AssetService);
  private utilities = inject(UtilityService);
  private contracts = inject(ContractsService);
  private grants = inject(UtilizerGrantService);

  openAsset(id: number): Observable<Asset | null> {
    return this.assets.getById(id).pipe(
      switchMap(item => this.sheet<EditDialogData<Asset>, Asset>(ASSET_DIALOG, {mode: 'edit', item})),
      switchMap(r => (r ? this.assets.update(r.id, r) : of(null))),
      catchError(err => this.fail("Errore apertura/salvataggio dell'immobile", err)),
    );
  }

  openUtility(id: number): Observable<Utility | null> {
    return this.utilities.getById(id).pipe(
      switchMap(item => this.sheet<EditDialogData<Utility>, Utility>(UTILITY_DIALOG, {mode: 'edit', item})),
      switchMap(r => (r ? this.utilities.update(r.id, r) : of(null))),
      catchError(err => this.fail("Errore apertura/salvataggio dell'utenza", err)),
    );
  }

  createUtility(prefill: Utility): Observable<Utility | null> {
    return this.sheet<EditDialogData<Utility>, Utility>(UTILITY_DIALOG, {mode: 'create', item: prefill}).pipe(
      switchMap(r => (r ? this.utilities.create({...r, ...this.authorship()}) : of(null))),
      catchError(err => this.fail("Errore nella creazione dell'utenza", err)),
    );
  }

  // Il dialog impianto salva da sé e chiude con true se ha salvato qualcosa.
  openPlant(id: number): Observable<boolean> {
    return this.sheet<{plantId: number; readOnly: boolean}, boolean>(PLANT_DIALOG, {plantId: id, readOnly: this.readOnly()}).pipe(
      map(saved => !!saved),
    );
  }

  createPlant(assetId: number | null): Observable<boolean> {
    return this.sheet<{plantId: null; assetId: number | null; readOnly: boolean}, boolean>(
      PLANT_DIALOG, {plantId: null, assetId, readOnly: this.readOnly()},
    ).pipe(map(saved => !!saved));
  }

  openSupplyContract(id: number): Observable<Contract | null> {
    return this.contracts.getById(id).pipe(
      switchMap(item => this.sheet<EditDialogData<Contract>, Contract>(CONTRACT_DIALOG, {mode: 'edit', item})),
      switchMap(r => (r ? this.contracts.update(r.id, r) : of(null))),
      catchError(err => this.fail('Errore apertura/salvataggio del contratto', err)),
    );
  }

  createSupplyContract(utilityIds: number[]): Observable<Contract | null> {
    return this.sheet<EditDialogData<Contract> & {preselectedUtilityIds: number[]}, Contract>(
      CONTRACT_DIALOG, {mode: 'create', item: Contract.create(), preselectedUtilityIds: utilityIds},
    ).pipe(
      switchMap(r => (r ? this.contracts.create(r) : of(null))),
      catchError(err => this.fail('Errore nella creazione del contratto', err)),
    );
  }

  openGrant(id: number): Observable<UtilizerGrant | null> {
    return this.grants.getById(id).pipe(
      switchMap(item => this.sheet<EditDialogData<UtilizerGrant>, UtilizerGrant>(GRANT_DIALOG, {mode: 'edit', item})),
      switchMap(r => (r ? this.grants.update(r.id, r) : of(null))),
      catchError(err => this.fail('Errore apertura/salvataggio del contratto immobiliare', err)),
    );
  }

  createGrant(assetIds: number[]): Observable<UtilizerGrant | null> {
    return this.sheet<EditDialogData<UtilizerGrant>, UtilizerGrant>(
      GRANT_DIALOG, {mode: 'create', item: UtilizerGrant.create({asset_ids: assetIds})},
    ).pipe(
      switchMap(r => (r ? this.grants.create(r) : of(null))),
      catchError(err => this.fail('Errore nella creazione del contratto immobiliare', err)),
    );
  }

  private sheet<D, R>(load: () => Promise<ComponentType<unknown>>, data: D): Observable<R | undefined> {
    return from(load()).pipe(
      switchMap(component => openSheet<unknown, D, R>(this.dialog, component, data).afterClosed()),
    );
  }

  private readOnly(): boolean {
    const role = this.auth.getCurrentUser()?.role;
    return !role || role === 'Lettore';
  }

  private authorship(): {created_by_user_id?: number; updated_by_user_id?: number} {
    const userId = this.auth.getCurrentUser()?.id;
    return {created_by_user_id: userId, updated_by_user_id: userId};
  }

  private fail(message: string, err: unknown): Observable<null> {
    console.error(message, err);
    return of(null);
  }
}
