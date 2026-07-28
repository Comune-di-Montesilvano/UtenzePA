import { AbstractControl, ValidationErrors, ValidatorFn, FormGroup } from '@angular/forms';

export function italianVatNumberValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value: string = control.value ?? '';
    if (!value) return null;
    return /^\d{11}$/.test(value) ? null : { italianVatNumber: true };
  };
}

export function italianTaxCodeValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value: string = (control.value ?? '').trim().toUpperCase();
    if (!value) return null;

    const vat: string = (control.parent?.get('vat_number')?.value ?? '').trim();
    if (/^\d{11}$/.test(vat) && value === vat) return null;

    const pattern = /^[A-Z]{6}\d{2}[A-EHLMPRST]\d{2}[A-Z]\d{3}[A-Z]$/;
    return pattern.test(value) ? null : { italianTaxCode: true };
  };
}

export function taxCodeMatchesVatNumberValidator(): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const fg = group as FormGroup;
    const vatCtrl = fg.get('vat_number');
    const taxCtrl = fg.get('tax_code');
    if (!vatCtrl || !taxCtrl) return null;

    const vat: string = (vatCtrl.value ?? '').trim();
    const tax: string = (taxCtrl.value ?? '').trim();

    const vatIsValid = /^\d{11}$/.test(vat);

    if (vatIsValid && tax && tax !== vat) {
      return { taxCodeMustMatchVatNumber: true };
    }

    return null;
  };
}

export function italianPostalCodeValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value: string = control.value ?? '';
    if (!value) return null;
    return /^\d{5}$/.test(value) ? null : { italianPostalCode: true };
  };
}
