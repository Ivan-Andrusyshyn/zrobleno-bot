import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DataService } from './data.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<main><router-outlet /></main>`,
  styles: `main { max-width: 1120px; margin: 0 auto; padding: 0 16px 48px; }`,
})
export class App implements OnInit {
  private data = inject(DataService);
  ngOnInit() { this.data.load(); }
}
