import {Component, inject, ChangeDetectionStrategy} from '@angular/core';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatAutocompleteModule} from '@angular/material/autocomplete';
import {MatIconModule} from '@angular/material/icon';
import {MatButtonModule} from '@angular/material/button';
import {MatTooltipModule} from '@angular/material/tooltip';
import {plainToInstance} from 'class-transformer';
import {EditDialogData} from '../../core/components/abstract-data-table.component';
import {AssetAggregator} from './entity/asset-aggregator.entity';
import {AssetAggregatorIconOptions, ASSET_AGGREGATOR_ICON_FALLBACK} from './enum/asset-aggregator-icon.enum';
import {IconPickerDialogComponent} from './icon-picker-dialog.component';
import {AuthService} from '../../services/auth.service';
import {HasRoleDirective} from '../../core/directives/has-role.directive';
import {ReadOnlyDirective} from '../../core/directives/read-only.directive';

@Component({
  selector: 'app-asset-aggregator-edit-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    HasRoleDirective,
    ReadOnlyDirective
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './asset-aggregator-edit-dialog.component.html'
})
export class AssetAggregatorEditDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<AssetAggregatorEditDialogComponent, AssetAggregator | undefined>);
  private dialog = inject(MatDialog);
  private authService = inject(AuthService);
  protected data = inject<EditDialogData<AssetAggregator>>(MAT_DIALOG_DATA);

  isNew = this.data.mode === 'create';
  iconFallback = ASSET_AGGREGATOR_ICON_FALLBACK;
  // Suggerimenti mostrati nell'autocomplete, ma il campo resta testo libero:
  // qualunque nome ligature valido del set "Material Icons" classico
  // (fonts.google.com/icons, filtro "Material Icons") è accettato, non solo
  // quelli in questa lista curata — vedi nota in asset-aggregator-icon.enum.ts.
  filteredIconOptions = AssetAggregatorIconOptions;
  // Valore sentinella per l'opzione "Altro..." in fondo all'autocomplete —
  // mai un nome icona reale (mai salvato: onIconOptionSelected lo intercetta
  // e ripristina il valore precedente prima di aprire il picker).
  readonly moreIconsSentinel = '__more_icons__';

  form = this.fb.group({
    code: [this.data.item.code ?? '', Validators.required],
    description: [this.data.item.description ?? '', Validators.required],
    icon: [this.data.item.icon ?? ASSET_AGGREGATOR_ICON_FALLBACK],
  });

  // Testo digitato dall'utente prima della selezione dell'opzione "Altro..."
  // (sentinella, mai un nome icona reale) — usato per ripristinare il campo
  // al testo libero originale invece di lasciarci dentro la sentinella.
  private lastTypedTerm = '';

  constructor() {
    this.form.controls.icon.valueChanges.subscribe((term) => {
      if (term === this.moreIconsSentinel) return;
      this.lastTypedTerm = term ?? '';
      const t = this.lastTypedTerm.trim().toLowerCase();
      this.filteredIconOptions = t
        ? AssetAggregatorIconOptions.filter((o) => o.value.includes(t) || o.label.toLowerCase().includes(t))
        : AssetAggregatorIconOptions;
    });

    // ReadOnlyDirective sul <form> nel template imposta solo pointer-events:none,
    // bypassabile da tastiera/screen reader. Qui disabilitiamo esplicitamente il
    // FormGroup per il ruolo Lettore, cosi' i controlli sono anche
    // programmaticamente non modificabili e save() non puo' inviare dati
    // (gate di autorizzazione lato client per il ruolo Lettore).
    const role = this.authService.getCurrentUser()?.role;
    if (!role || role === 'Lettore') {
      this.form.disable();
    }
  }

  onIconOptionSelected(selected: string): void {
    if (selected !== this.moreIconsSentinel) return;
    this.form.controls.icon.setValue(this.lastTypedTerm, { emitEvent: false });
    this.openIconPicker();
  }

  // Autocomplete limitato ai suggerimenti curati (AssetAggregatorIconOptions,
  // sottoinsieme piccolo) — per cercare su tutto il catalogo Material Icons
  // (~2500 nomi, non bundlato in app) apre questo dialog dedicato.
  openIconPicker(): void {
    this.dialog
      .open(IconPickerDialogComponent, {
        width: '480px',
        data: { currentIcon: this.form.controls.icon.value },
      })
      .afterClosed()
      .subscribe((result?: string) => {
        if (result) this.form.controls.icon.setValue(result);
      });
  }

  save(): void {
    if (!this.form.valid) return;
    const result = plainToInstance(AssetAggregator, {
      id: this.data.item.id,
      ...this.form.getRawValue()
    });
    this.dialogRef.close(result);
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
