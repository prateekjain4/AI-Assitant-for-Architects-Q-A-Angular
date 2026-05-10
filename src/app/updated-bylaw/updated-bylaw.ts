import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { finalize } from 'rxjs/operators';
import { environment } from '../../environments/environment';


@Component({
  selector: 'app-updated-bylaw',
  standalone: false,
  templateUrl: './updated-bylaw.html',
  styleUrls: ['./updated-bylaw.css']
})
export class UpdatedBylaw implements OnInit{
  updates: any = {
    added: [],
    modified: [],
    removed: []
  };

  loading = false;
  checking = false;

  private changesApi = environment.apiUrl + '/changes';

  constructor(private http: HttpClient, private cd: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.fetchChanges();
  }

  fetchChanges(): void {

    this.loading = true;

    this.http.get<any>(this.changesApi).subscribe({
      next: (response) => {

        console.log("Changes received:", response);

        // allow the backend to give us either a wrapper object or the
        // changes object itself
        if (response) {
          this.updates = response.changes ?? response;
        } else {
          this.updates = { added: [], modified: [], removed: [] };
        }

        this.loading = false;
        this.cd.detectChanges();
      },
      error: (err) => {

        console.error("Error fetching changes", err);

        this.loading = false;
      }
    });

  }

  checkForUpdates(): void {

    this.checking = true;

    // clear any previous results while we wait
    this.updates = {
      added: [],
      modified: [],
      removed: []
    };

    this.http.post<any>(environment.apiUrl + '/check-updates', {})
      // always make sure the flag is cleared once the observable completes
      .pipe(finalize(() => {
        // finalize will run on both success and error
        this.checking = false;
        this.cd.detectChanges();
      }))
      .subscribe({

        next: (response) => {

          console.log("Pipeline finished:", response);

          // some backends return { changes: {...} } while others return the
          // object directly. be flexible so the UI can display the results.
          if (response) {
            this.updates = response.changes ?? response;
          }

          this.checking = false;
          this.cd.detectChanges();      // make sure the UI is updated after async work
        },

        error: (err) => {

          console.error("Error running update pipeline", err);

          this.checking = false;
          this.cd.detectChanges();
        }

    });

  }


}
