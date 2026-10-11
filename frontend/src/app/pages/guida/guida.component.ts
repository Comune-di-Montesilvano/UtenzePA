import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MatButtonModule } from '@angular/material/button';
import { Marked } from 'marked';
import { GUIDA_URL, guidaSlug } from './guida';

// HTML grezzo scartato, id sui titoli (stessa regola di guidaSlug), link
// esterni in una nuova scheda. Il contenuto è il nostro file nel repository:
// bypassSecurityTrustHtml serve solo perché il sanitizer di Angular toglie gli id.
const marked = new Marked({
  gfm: true,
  renderer: {
    html: () => '',
    heading({ tokens, depth, text }) {
      return `<h${depth} id="${guidaSlug(text)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
    },
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      const external = /^https?:\/\//.test(href);
      const t = title ? ` title="${title}"` : '';
      return external
        ? `<a href="${href}"${t} target="_blank" rel="noopener noreferrer">${text}</a>`
        : `<a href="${href}"${t}>${text}</a>`;
    },
  },
});

@Component({
  selector: 'app-guida',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  // Gli stili devono raggiungere l'HTML inserito con innerHTML (senza gli
  // attributi _ngcontent): regole tutte sotto .guida-md / .guida-toc.
  encapsulation: ViewEncapsulation.None,
  imports: [RouterModule, MatButtonModule],
  templateUrl: './guida.component.html',
  styleUrl: './guida.component.scss',
})
export class GuidaComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private sanitizer = inject(DomSanitizer);
  private cdr = inject(ChangeDetectorRef);

  html: SafeHtml | null = null;
  sections: { id: string; title: string }[] = [];
  error = false;
  private fragment: string | null = null;

  ngOnInit(): void {
    this.route.fragment.subscribe((f) => {
      this.fragment = f;
      if (this.html) this.scrollToFragment();
    });
    this.load();
  }

  load(): void {
    this.error = false;
    fetch(GUIDA_URL, { cache: 'no-cache' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((md) => {
        this.sections = md
          .split('\n')
          .filter((line) => line.startsWith('## '))
          .map((line) => ({ id: guidaSlug(line.slice(3).trim()), title: line.slice(3).trim() }));
        this.html = this.sanitizer.bypassSecurityTrustHtml(marked.parse(md, { async: false }));
        this.cdr.markForCheck();
        this.scrollToFragment();
      })
      .catch(() => {
        this.error = true;
        this.cdr.markForCheck();
      });
  }

  // Al frame successivo: il contenuto appena inserito ha già l'altezza finale.
  private scrollToFragment(): void {
    const id = this.fragment;
    if (!id) return;
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
  }
}
