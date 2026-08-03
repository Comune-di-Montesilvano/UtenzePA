import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SetupService } from '../../services/setup.service';

@Component({
  selector: 'app-setup',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, RouterModule],
  templateUrl: './setup.component.html',
  styleUrls: ['./setup.component.scss']
})
export class SetupComponent {
  form: FormGroup;
  otpForm: FormGroup;
  showOtp = false;
  error = '';
  otpError = '';

  constructor(private fb: FormBuilder, private router: Router, private setup: SetupService) {
    this.form = this.fb.group({
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]]
    });

    this.otpForm = this.fb.group({
      otp: ['', Validators.required]
    });
  }

  async requestOtp() {
    if (!this.form.valid) {
      this.error = 'Compilare tutti i campi richiesti.';
      return;
    }
    const { firstName, lastName, email, password } = this.form.value;
    const success = await this.setup.requestOtp(email, firstName, lastName, password);
    if (success) {
      this.showOtp = true;
      this.error = '';
    } else {
      this.error = 'Impossibile avviare la configurazione. Riprova.';
    }
  }

  async verifyOtp() {
    if (!this.otpForm.valid) {
      this.otpError = 'Inserire il codice ricevuto via email.';
      return;
    }
    const { email } = this.form.value;
    const { otp } = this.otpForm.value;
    const success = await this.setup.verifyOtp(email, otp);
    if (success) {
      this.router.navigate(['/login']);
    } else {
      this.otpError = 'Codice non valido o scaduto.';
    }
  }
}
