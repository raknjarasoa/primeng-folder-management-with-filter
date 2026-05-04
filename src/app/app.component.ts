import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FolderTreeComponent } from './components/folder-tree.component';

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FolderTreeComponent],
  template: `<app-folder-tree />`,
})
export class AppComponent {}
