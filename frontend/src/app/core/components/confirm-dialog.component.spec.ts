import {ComponentFixture, TestBed} from '@angular/core/testing';
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material/dialog';
import {ConfirmDialogComponent, ConfirmDialogData} from './confirm-dialog.component';

describe('ConfirmDialogComponent', () => {
  let fixture: ComponentFixture<ConfirmDialogComponent>;
  let dialogRefSpy: jasmine.SpyObj<MatDialogRef<ConfirmDialogComponent>>;
  const data: ConfirmDialogData = {
    title: 'Elimina finalità d\'uso',
    message: 'Elimina finalità d\'uso Test?',
    confirmLabel: 'Elimina',
    danger: true
  };

  beforeEach(async () => {
    dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['close']);
    await TestBed.configureTestingModule({
      imports: [ConfirmDialogComponent],
      providers: [
        {provide: MAT_DIALOG_DATA, useValue: data},
        {provide: MatDialogRef, useValue: dialogRefSpy}
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(ConfirmDialogComponent);
    fixture.detectChanges();
  });

  it('renders title, message and confirm label from injected data', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Elimina finalità d\'uso');
    expect(text).toContain('Elimina finalità d\'uso Test?');
    expect(text).toContain('Elimina');
  });

  it('closes with true on confirm', () => {
    fixture.componentInstance.confirm();
    expect(dialogRefSpy.close).toHaveBeenCalledWith(true);
  });

  it('closes with false on cancel', () => {
    fixture.componentInstance.cancel();
    expect(dialogRefSpy.close).toHaveBeenCalledWith(false);
  });
});
