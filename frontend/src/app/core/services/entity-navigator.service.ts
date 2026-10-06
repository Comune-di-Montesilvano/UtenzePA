import {inject, Injectable} from '@angular/core';
import {ComponentType} from '@angular/cdk/portal';
import {MatDialog} from '@angular/material/dialog';
import {catchError, from, map, Observable, of, switchMap} from 'rxjs';
import {openSheet} from '../components/entity-sheet/sheet-utils';
import {EDIT_DIALOG_POSITION, EditDialogData} from '../components/abstract-data-table.component';
import {AuthService} from '../../services/auth.service';
import {AssetService} from '../../pages/assets/asset.service';
import {Asset} from '../../pages/assets/entity/asset.entity';
import {UtilityService} from '../../pages/utilities/utility.service';
import {Utility} from '../../pages/utilities/entity/utility.entity';
import {ContractsService} from '../../pages/contracts/contract.service';
import {Contract} from '../../pages/contracts/entity/contract.entity';
import {UtilizerGrantService} from '../../pages/utilizer-grant/utilizer-grant.service';
import {UtilizerGrant} from '../../pages/utilizer-grant/entity/utilizer-grant.entity';
import {ThirdPartiesService} from '../../pages/third-parties/third-parties.service';
import {ThirdParty} from '../../pages/third-parties/entity/third-party.entity';
import {InvoicesService} from '../../pages/invoices/invoices.service';
import {Invoice} from '../../pages/invoices/entity/invoice.entity';
import {BudgetChaptersService} from '../../pages/budget-chapters/budget-chapters.service';
import {BudgetChapter} from '../../pages/budget-chapters/entity/budget-chapter.entity';
import {ConsipAgreementService} from '../../pages/consip-agreement/consip-agreement.service';
import {ConsipAgreement} from '../../pages/consip-agreement/entity/consip-agreement.entity';
import {UtilityTypesService} from '../../pages/utility-types/utility-types.service';
import {UtilityType} from '../../pages/utility-types/entity/utility-type.entity';
import {AssetNaturesService} from '../../pages/asset-nature/asset-nature.service';
import {AssetNature} from '../../pages/asset-nature/entity/asset-nature.entity';
import {AssetFunctionsService} from '../../pages/asset-function/asset-function.service';
import {AssetFunction} from '../../pages/asset-function/entity/asset-function.entity';
import {CommitmentService} from '../../pages/contracts/commitments/commitment.service';
import {chapterLabel, Commitment, CommitmentPayload} from '../../pages/contracts/commitments/commitment.model';
import type {CommitmentDialogData} from '../../pages/contracts/commitments/commitment-edit-dialog.component';
import type {Plant} from '../../pages/plants/plant.model';
import {ToastService} from './toast.service';

// Import dinamici: i dialog iniettano questo servizio, un import statico dei
// dialog qui creerebbe un ciclo di moduli.
const ASSET_DIALOG = () => import('../../pages/assets/asset-edit-dialog.component').then(m => m.AssetEditDialogComponent);
const UTILITY_DIALOG = () => import('../../pages/utilities/utility-edit-dialog.component').then(m => m.UtilityEditDialogComponent);
const PLANT_DIALOG = () => import('../../pages/plants/plant-edit-dialog.component').then(m => m.PlantEditDialogComponent);
const CONTRACT_DIALOG = () => import('../../pages/contracts/contract-edit-dialog.component').then(m => m.ContractEditDialogComponent);
const GRANT_DIALOG = () => import('../../pages/utilizer-grant/utilizer-grant-edit-dialog.component').then(m => m.UtilizerGrantEditDialogComponent);
const INVOICE_DIALOG = () => import('../../pages/invoices/invoice-edit-dialog.component').then(m => m.InvoiceEditDialogComponent);
const THIRD_PARTY_DIALOG = () => import('../../pages/third-parties/third-party-edit-dialog.component').then(m => m.ThirdPartyEditDialogComponent);
const BUDGET_CHAPTER_DIALOG = () => import('../../pages/budget-chapters/budget-chapter-edit-dialog.component').then(m => m.BudgetChapterEditDialogComponent);
const CONSIP_DIALOG = () => import('../../pages/consip-agreement/consip-agreement-edit-dialog.component').then(m => m.ConsipAgreementEditDialogComponent);
const UTILITY_TYPE_DIALOG = () => import('../../pages/utility-types/utility-type-edit-dialog.component').then(m => m.UtilityTypeEditDialogComponent);
const NATURE_DIALOG = () => import('../../pages/asset-nature/asset-nature-edit-dialog.component').then(m => m.AssetNatureEditDialogComponent);
const FUNCTION_DIALOG = () => import('../../pages/asset-function/asset-function-edit-dialog.component').then(m => m.AssetFunctionEditDialogComponent);
const COMMITMENT_DIALOG = () => import('../../pages/contracts/commitments/commitment-edit-dialog.component').then(m => m.CommitmentEditDialogComponent);

// Testo digitato in una select → campo nome dell'entità creata al volo.
export const nameFrom = (text: string): string | undefined => (text.trim() ? text.trim() : undefined);

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
  private thirdParties = inject(ThirdPartiesService);
  private invoices = inject(InvoicesService);
  private toast = inject(ToastService);
  private chapters = inject(BudgetChaptersService);
  private consip = inject(ConsipAgreementService);
  private utilityTypes = inject(UtilityTypesService);
  private natures = inject(AssetNaturesService);
  private functions = inject(AssetFunctionsService);
  private commitmentService = inject(CommitmentService);

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
    return this.sheet<{plantId: number}, Plant | null>(PLANT_DIALOG, {plantId: id}).pipe(
      map(saved => !!saved),
    );
  }

  // Restituisce l'impianto salvato (il dialog resta aperto dopo la creazione).
  createPlant(assetId: number | null): Observable<Plant | null> {
    return this.sheet<{plantId: null; assetId: number | null}, Plant | null>(
      PLANT_DIALOG, {plantId: null, assetId},
    ).pipe(map(p => p ?? null));
  }

  openSupplyContract(id: number): Observable<Contract | null> {
    return this.contracts.getById(id).pipe(
      switchMap(item => this.sheet<EditDialogData<Contract>, Contract>(CONTRACT_DIALOG, {mode: 'edit', item})),
      switchMap(r => (r ? this.contracts.update(r.id, r) : of(null))),
      catchError(err => this.fail('Errore apertura/salvataggio del contratto di fornitura', err)),
    );
  }

  createSupplyContract(utilityIds: number[], prefill: Partial<Contract> = {}): Observable<Contract | null> {
    return this.sheet<EditDialogData<Contract> & {preselectedUtilityIds: number[]}, Contract>(
      CONTRACT_DIALOG, {mode: 'create', item: Contract.create(prefill), preselectedUtilityIds: utilityIds},
    ).pipe(
      switchMap(r => (r ? this.contracts.create(r) : of(null))),
      catchError(err => this.fail('Errore nella creazione del contratto di fornitura', err)),
    );
  }

  openInvoice(id: number): Observable<Invoice | null> {
    return this.invoices.getById(id).pipe(
      switchMap(item => this.sheet<EditDialogData<Invoice>, Invoice>(INVOICE_DIALOG, {mode: 'edit', item})),
      switchMap(r => (r ? this.invoices.update(r.id, r) : of(null))),
      catchError(err => this.fail('Errore apertura/salvataggio della fattura', err)),
    );
  }

  openThirdParty(id: number): Observable<ThirdParty | null> {
    return this.thirdParties.getById(id).pipe(
      switchMap(item => this.sheet<EditDialogData<ThirdParty>, ThirdParty>(THIRD_PARTY_DIALOG, {mode: 'edit', item})),
      switchMap(r => (r ? this.thirdParties.update(r.id, r) : of(null))),
      catchError(err => this.fail('Errore apertura/salvataggio del soggetto', err)),
    );
  }

  openGrant(id: number): Observable<UtilizerGrant | null> {
    return this.grants.getById(id).pipe(
      switchMap(item => this.sheet<EditDialogData<UtilizerGrant>, UtilizerGrant>(GRANT_DIALOG, {mode: 'edit', item})),
      switchMap(r => (r ? this.grants.update(r.id, r) : of(null))),
      catchError(err => this.fail('Errore apertura/salvataggio del contratto immobiliare', err)),
    );
  }

  createGrant(prefill: Partial<UtilizerGrant>): Observable<UtilizerGrant | null> {
    return this.sheet<EditDialogData<UtilizerGrant>, UtilizerGrant>(
      GRANT_DIALOG, {mode: 'create', item: UtilizerGrant.create(prefill)},
    ).pipe(
      switchMap(r => (r ? this.grants.create(r) : of(null))),
      catchError(err => this.fail('Errore nella creazione del contratto immobiliare', err)),
    );
  }

  createThirdParty(prefill: Partial<ThirdParty> = {}): Observable<ThirdParty | null> {
    return this.sheet<EditDialogData<ThirdParty>, ThirdParty>(THIRD_PARTY_DIALOG, {mode: 'create', item: ThirdParty.create(prefill)}).pipe(
      switchMap(r => (r ? this.thirdParties.create({...r, ...this.authorship()}) : of(null))),
      catchError(err => this.fail('Errore nella creazione del soggetto', err)),
    );
  }

  createAsset(prefill: Partial<Asset> = {}): Observable<Asset | null> {
    return this.sheet<EditDialogData<Asset>, Asset>(ASSET_DIALOG, {mode: 'create', item: Asset.create(prefill)}).pipe(
      switchMap(r => (r ? this.assets.create({...r, ...this.authorship()}) : of(null))),
      catchError(err => this.fail("Errore nella creazione dell'immobile", err)),
    );
  }

  createInvoice(prefill: Partial<Invoice> = {}): Observable<Invoice | null> {
    return this.sheet<EditDialogData<Invoice>, Invoice>(INVOICE_DIALOG, {mode: 'create', item: Invoice.create(prefill)}).pipe(
      switchMap(r => (r ? this.invoices.create({...r, ...this.authorship()}) : of(null))),
      catchError(err => this.fail('Errore nella creazione della fattura', err)),
    );
  }

  openBudgetChapter(id: number): Observable<BudgetChapter | null> {
    return this.chapters.getById(id).pipe(
      switchMap(item => this.sheet<EditDialogData<BudgetChapter>, BudgetChapter>(BUDGET_CHAPTER_DIALOG, {mode: 'edit', item})),
      switchMap(r => (r ? this.chapters.update(r.id, BudgetChapter.toPayload(r)) : of(null))),
      catchError(err => this.fail('Errore apertura/salvataggio del capitolo', err)),
    );
  }

  createBudgetChapter(): Observable<BudgetChapter | null> {
    return this.sheet<EditDialogData<BudgetChapter>, BudgetChapter>(BUDGET_CHAPTER_DIALOG, {mode: 'create', item: BudgetChapter.create()}).pipe(
      switchMap(r => (r ? this.chapters.create({...BudgetChapter.toPayload(r), ...this.authorship()}) : of(null))),
      catchError(err => this.fail('Errore nella creazione del capitolo', err)),
    );
  }

  createConsipAgreement(prefill: Partial<ConsipAgreement> = {}): Observable<ConsipAgreement | null> {
    return this.simple<EditDialogData<ConsipAgreement>, ConsipAgreement>(CONSIP_DIALOG, {mode: 'create', item: ConsipAgreement.create(prefill)}).pipe(
      switchMap(r => (r ? this.consip.create({...ConsipAgreement.toPayload(r), ...this.authorship()}) : of(null))),
      catchError(err => this.fail('Errore nella creazione della convenzione CONSIP', err)),
    );
  }

  createUtilityType(prefill: Partial<UtilityType> = {}): Observable<UtilityType | null> {
    return this.simple<EditDialogData<UtilityType>, UtilityType>(UTILITY_TYPE_DIALOG, {mode: 'create', item: UtilityType.create(prefill)}).pipe(
      switchMap(r => (r ? this.utilityTypes.create({...UtilityType.toPayload(r), ...this.authorship()}) : of(null))),
      catchError(err => this.fail('Errore nella creazione del tipo utenza', err)),
    );
  }

  createAssetNature(prefill: Partial<AssetNature> = {}): Observable<AssetNature | null> {
    return this.simple<EditDialogData<AssetNature>, AssetNature>(NATURE_DIALOG, {mode: 'create', item: AssetNature.create(prefill)}).pipe(
      switchMap(r => (r ? this.natures.create({...AssetNature.toPayload(r), ...this.authorship()}) : of(null))),
      catchError(err => this.fail('Errore nella creazione della tipologia', err)),
    );
  }

  // Una funzione nuova va anche tra le ammesse della tipologia scelta,
  // altrimenti la scheda immobile non la propone.
  createAssetFunction(natureId: number | null, prefill: Partial<AssetFunction> = {}): Observable<AssetFunction | null> {
    return this.simple<EditDialogData<AssetFunction>, AssetFunction>(FUNCTION_DIALOG, {mode: 'create', item: AssetFunction.create(prefill)}).pipe(
      switchMap(r => (r ? this.functions.create({...AssetFunction.toPayload(r), ...this.authorship()}) : of(null))),
      switchMap(fn => {
        if (!fn || natureId == null) return of(fn);
        // Nessun GET /asset-natures/:id: la tipologia si prende dall'elenco.
        return this.natures.search({deleted: false} as never).pipe(
          map(list => list.find(n => n.id === natureId)),
          // Tipologia non trovata: niente PATCH (manderebbe la sola funzione
          // nuova e toglierebbe le altre ammesse).
          switchMap(n => !n ? of(null) : this.natures.update(natureId, {
            function_ids: [...(n.functions ?? []).map(f => f.id), fn.id],
            updated_by_user_id: this.authorship().updated_by_user_id,
          } as Partial<AssetNature>)),
          map(() => fn),
        );
      }),
      catchError(err => this.fail('Errore nella creazione della funzione', err)),
    );
  }

  createCommitment(contractId: number): Observable<Commitment | null> {
    return this.chapters.search({deleted: false}).pipe(
      map(list => list
        .map(c => ({label: chapterLabel(c), value: c.id,
          searchText: `${c.chapter_code}/${c.article ?? 0} ${c.description ?? ''} ${c.pdc ?? ''}`}))
        .sort((a, b) => a.label.localeCompare(b.label))),
      switchMap(chapterOptions => this.simple<CommitmentDialogData, CommitmentPayload>(
        COMMITMENT_DIALOG, {item: null, chapterOptions}, '560px')),
      switchMap(p => (p ? this.commitmentService.create(contractId, p) : of(null))),
      catchError(err => this.fail("Errore nella creazione dell'impegno", err)),
    );
  }

  private sheet<D, R>(load: () => Promise<ComponentType<unknown>>, data: D): Observable<R | undefined> {
    return from(load()).pipe(
      switchMap(component => openSheet<unknown, D, R>(this.dialog, component, data).afterClosed()),
    );
  }

  // Anagrafiche semplici: dialog classico, come dall'elenco.
  private simple<D, R>(load: () => Promise<ComponentType<unknown>>, data: D, width = '1150px'): Observable<R | undefined> {
    return from(load()).pipe(
      switchMap(component => this.dialog.open<unknown, D, R>(component, {width, maxWidth: width, position: EDIT_DIALOG_POSITION, data}).afterClosed()),
    );
  }

  private authorship(): {created_by_user_id?: number; updated_by_user_id?: number} {
    const userId = this.auth.getCurrentUser()?.id;
    return {created_by_user_id: userId, updated_by_user_id: userId};
  }

  // Il messaggio del backend (es. "Partita IVA già usata da …") arriva all'utente.
  private fail(message: string, err: unknown): Observable<null> {
    console.error(message, err);
    const detail = (err as {error?: {message?: string | string[]}})?.error?.message;
    this.toast.add({severity: 'error', summary: message, detail: Array.isArray(detail) ? detail.join(', ') : detail});
    return of(null);
  }
}
