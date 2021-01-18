import {ApiClient} from "./clients/ApiClient";
import { v4 as uuidv4 } from 'uuid';
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
    const { mappings, create, checkIndex } = await import(that.file);
    const workingDir = this.file.match(/(.*)[\/\\]/)[1]||'';
    const indexExist =  await checkIndex(this.dataAPI);
    if(!indexExist) {
      await create(this.dataAPI, fs, workingDir);
    }
    await mappings(this.dataAPI, fs, workingDir);
    await this.migrationAPI.load(this.insertPayload());
  }

  public async rollback (): Promise<void> {
    if (!this.isApplied) { return }
    const { down } = await import(this.file);
    await down(this.dataAPI, this);
    await this.migrationAPI.load(this.removePayload());
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

  private removePayload() {
    return {
      "version" : "2017-02-28",
      "operation" : "PutItem",
      "key": {
        "id" : this.id
      },
      "attributeValues" : {
        "id" : this.id
      }
    }
  }

}