import {Component, inject, ChangeDetectionStrategy} from '@angular/core';
import {FormControl, ReactiveFormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatIconModule} from '@angular/material/icon';
import {MatButtonModule} from '@angular/material/button';

export interface IconPickerDialogData {
  currentIcon?: string;
}

// Non bundliamo un elenco completo delle ~2500 icone Material Icons in app:
// scriverlo a mano da conoscenza rischierebbe nomi inventati/non esistenti
// (icona selezionata ma vuota sul marker, silenzioso e difficile da
// diagnosticare per chi compila). Il catalogo ufficiale su Google Fonts è
// sempre corretto e aggiornato — questo dialog fa da tramite: link al
// catalogo per cercare/copiare il nome esatto, campo con anteprima live per
// verificare subito che il nome digitato/incollato esista davvero nel font
// già caricato in questo progetto (index.html, set "Material Icons"
// classico, non "Material Symbols").
@Component({
  selector: 'app-icon-picker-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatIconModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './icon-picker-dialog.component.html'
})
export class IconPickerDialogComponent {
  private dialogRef = inject(MatDialogRef<IconPickerDialogComponent, string | undefined>);
  protected data = inject<IconPickerDialogData>(MAT_DIALOG_DATA);

  iconControl = new FormControl(this.data.currentIcon ?? '', {nonNullable: true});

  confirm(): void {
    const value = this.iconControl.value.trim();
    if (!value) return;
    this.dialogRef.close(value);
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }
}
