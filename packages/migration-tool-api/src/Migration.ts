import {ApiClient} from "./clients/ApiClient";
import {v4 as uuidv4} from 'uuid';
import * as fs from 'fs';

export class Migration {

  public readonly id :string;
  public readonly isApplied: boolean;
  public readonly file: string;
  public readonly dataAPI: ApiClient;
  public readonly migrationAPI: ApiClient;

  constructor({id,
              file,
              isApplied,
              dataAPI,
              migrationAPI
  }) {
    this.id = id;
    this.file = file;
    this.isApplied = isApplied;
    this.dataAPI = dataAPI;
    this.migrationAPI = migrationAPI;
  }

  public async apply (): Promise<void> {
    if (this.isApplied) { return }
    let that = this;
    const workingDir = this.file.match(/(.*)[\/\\]/)[1]||'';
    const { up } = await import(that.file);
    await up(this.dataAPI, workingDir);
    await this.migrationAPI.load(this.insertPayload());
  }

  private insertPayload() {
    return {
      "version" : "2017-02-28",
      "operation" : "PutItem",
      "key": {
        "id":{"S": uuidv4() },
         "migration_id" : {"S" : this.id }
      },
      "attributeValues" : {
        "migration_id" : {"S": this.id }
      }
    }
  }

}