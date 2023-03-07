import * as path from 'path';
import { Compiler } from './Compiler';
import { DataApiClientModule } from './DataApiClientModule';
import { Migration } from './Migration';
import { TypeScriptCompiler } from './TypeScriptCompiler';

export interface DataAPIMigrationsConfig {
  cwd?: string;
  migrationsFolder?: string;
  typescript?: boolean;
  isLocal?: boolean;
  dataAPI: DataApiClientModule.DataApiClient;
  migrationAPI: DataApiClientModule.DataApiClient;
}

export class ApiLogicDataMigration {
  public readonly cwd: string;
  public readonly dataAPI: DataApiClientModule.DataApiClient;
  public readonly migrationAPI: DataApiClientModule.DataApiClient;
  public readonly migrationsPath: string;
  protected buildPath: string;

  constructor({ cwd, migrationsFolder, dataAPI, migrationAPI }: DataAPIMigrationsConfig) {
    this.cwd = cwd || process.cwd();
    this.dataAPI = dataAPI;
    this.migrationAPI = migrationAPI;
    this.migrationsPath = path.join(this.cwd, migrationsFolder);
    this.buildPath = path.join(this.cwd, migrationsFolder, '.migrations_build');
  }

  public async getAppliedMigrationIds(): Promise<string[]> {
    const result = await this.migrationAPI.fetchMigrations();
    return result.items.map((it) => it.migration_id);
  }

  public async applyMigrations(): Promise<string[]> {
    const [migrations, compiler] = await this.bootstrap();
    const migrationsToRun = migrations.filter((migration) => !migration.isApplied);
    try {
      for (let i = 0; i < migrationsToRun.length; i++) {
        await migrationsToRun[i].apply();
      }
      return migrationsToRun.map((migration) => migration.id);
    } finally {
      await compiler.cleanup();
    }
  }

  private async bootstrap(): Promise<[Migration[], Compiler]> {
    const compiler = new TypeScriptCompiler({
      cwd: this.cwd,
      migrationsPath: this.migrationsPath,
      buildPath: this.buildPath,
    });
    const appliedMigrationIds = await this.getAppliedMigrationIds();
    let files = await compiler.compile();
    if (files === undefined) {
      files = [];
    }
    const migrations = files
      .map((file) => {
        const fileName = path.basename(file, '.js');
        const match = fileName.match(/^(?<id>__V(?<vid>\d*)__)(?<name>\w+)/);
        if (!match || !match.groups || !match.groups.id || !match.groups.vid || !match.groups.name) {
          return null;
        } else {
          const id = match.groups.id;
          const vid = parseInt(match.groups.vid);
          const name = match.groups.name;
          return { id, vid, name, file };
        }
      })
      .filter((data) => data !== null)
      .sort((a, b) => a.vid - b.vid)
      .map(
        ({ id, ...data }) =>
          new Migration({
            id,
            ...data,
            isApplied: appliedMigrationIds.includes(id),
            dataAPI: this.dataAPI.apiClient,
            migrationAPI: this.migrationAPI.apiClient,
          })
      );
    return [migrations, compiler];
  }
}

export default ApiLogicDataMigration;
