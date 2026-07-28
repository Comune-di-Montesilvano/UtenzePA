import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { AbstractSearchComponent } from '../../core/components/abstract-search.component';

@Component({
  selector: 'app-search-users',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    DialogModule,
    SelectModule,
  ],
  templateUrl: './search-users.component.html',
})
export class SearchUsersComponent extends AbstractSearchComponent implements OnInit {

  roles = [
    { label: 'Admin', value: 'Admin' },
    { label: 'Operatore', value: 'Operatore' },
    { label: 'Lettore', value: 'Lettore' }
  ];

  statuses = [
    { label: 'Attivo', value: 'Attivo' },
    { label: 'Disattivo', value: 'Disattivo' }
  ];

  constructor(private fb: FormBuilder) {
    super();
    this.qSearch = this.fb.group({
      qsearch: [''],
      firstName: [''],
      lastName: [''],
      email: [''],
      role: [null],
      status: [null],
    });
  }
}
