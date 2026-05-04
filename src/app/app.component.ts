import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FolderTreeComponent } from 'layout-folder-management';

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FolderTreeComponent],
  template: `<app-folder-tree />`,
})
export class AppComponent {}
