import { Routes } from '@angular/router';
import { Home } from './home';
import { ParticipantPage } from './participant';

export const routes: Routes = [
  { path: '', component: Home, title: 'Зроблено. — учасники' },
  { path: 'p/:id', component: ParticipantPage, title: 'Зроблено. — учасник' },
  { path: '**', redirectTo: '' },
];
