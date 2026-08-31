import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';

import { AuthService } from '../../services/auth.service';
import { BrandingService } from '../../services/branding.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterModule],
  templateUrl: './login.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./login.component.scss']
})
export class LoginComponent {
  form: FormGroup;
  resetForm: FormGroup;
  otpForm: FormGroup;
  error = '';
  showReset = false;
  showOtp = false;
  userEmail = '';
  otpError = '';
  entityName = inject(BrandingService).current().entity_name;

  constructor(private fb: FormBuilder, private router: Router, private auth: AuthService) {
    this.form = this.fb.group({
      username: ['', Validators.required],
      password: ['', Validators.required]
    });

    this.resetForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });

    this.otpForm = this.fb.group({
      otp: ['', Validators.required],
      newPassword: ['', Validators.required]
    });
  }

  async submit() {
    if (this.form.valid) {
      const { username, password } = this.form.value;

      if (await this.auth.login(username, password)) {
        this.router.navigate(['/']);
      } else {
        this.error = this.auth.message_error.length > 0 ? this.auth.message_error : 'Credenziali non valide.';
      }
    } else {
      this.error = 'Compilare i dati richiesti.';
    }
  }

  showResetForm() {
    this.showReset = true;
    this.error = '';
  }

  async sendOtp() {
    this.userEmail = this.resetForm.value.email;
    const success = await this.auth.generateOtp(this.userEmail);

    if (success) {
      this.showOtp = true;
      this.showReset = false;
    }

    alert('In presenza di un indirizzo email valido e registrato, il sistema provvederà all’invio di un codice OTP.');
  }

  async resetPassword() {
    const { otp, newPassword } = this.otpForm.value;
    const success = await this.auth.resetPassword(this.userEmail, otp, newPassword);

    if (success) {
      alert('Password resettata con successo!');
      this.showOtp = false;
      this.form.reset();
    } else {
      this.otpError = 'OTP non valido o scaduto.';
    }
  }

  showLoginForm() {
    this.showReset = false;
    this.showOtp = false;
    this.error = '';
  }

}
