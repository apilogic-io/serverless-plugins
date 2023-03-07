import { ApiClient } from './clients/ApiClient';
import { v4 as uuidv4 } from 'uuid';

export interface MigrationsConfig {
  id?: string;
  vid?: number;
  file?: string;
  isApplied?: boolean;
  dataAPI: ApiClient;
  migrationAPI: ApiClient;
}

export class Migration {
  public readonly id: string;
  public readonly vid: number;
  public readonly isApplied: boolean;
  public readonly file: string;
  public readonly dataAPI: ApiClient;
  public readonly migrationAPI: ApiClient;

  constructor({ id, vid, file, isApplied, dataAPI, migrationAPI }: MigrationsConfig) {
    this.id = id;
    this.vid = vid;
    this.file = file;
    this.isApplied = isApplied;
    this.dataAPI = dataAPI;
    this.migrationAPI = migrationAPI;
  }

  public async apply(): Promise<void> {
    if (this.isApplied) {
      return;
    }
    const that = this.file;
    const workingDir = this.file.match(/(.*)[/\\]/)[1] || '';
    const { up } = await import(that);
    await up(this.dataAPI, workingDir);
    await this.migrationAPI.load(this.insertPayload());
  }

  private insertPayload() {
    return {
      version: '2017-02-28',
      operation: 'PutItem',
      key: {
        id: { S: uuidv4() },
      },
      attributeValues: {
        migration_id: { S: this.id },
      },
    };
  }
}
