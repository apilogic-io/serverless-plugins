import {DataApiClientModule} from "./DataApiClientModule";
import {Migration} from './Migration';
import {TypeScriptCompiler} from "./TypeScriptCompiler";
import {Compiler, CompilerDerived} from "./Compiler";
import * as path from "path";

// const ID_FORMAT = 'yyyyMMddHHmmss';

export interface DataAPIMigrationsConfig {
  cwd?: string;
  migrationsFolder?: string;
  typescript?: boolean;
  logger?: Function;
  compiler?: CompilerDerived;
  isLocal?: boolean;
  dataAPI: DataApiClientModule.DataApiClient;
  migrationAPI: DataApiClientModule.DataApiClient;
}


export class ApiLogicDataMigration {
  public readonly cwd: string;
  public readonly dataAPI: DataApiClientModule.DataApiClient;
  public readonly migrationAPI: DataApiClientModule.DataApiClient;
  public readonly migrationsPath: string;
  protected compiler: CompilerDerived;
  protected buildPath: string;

  constructor({
                cwd,
                migrationsFolder,
                dataAPI,
                migrationAPI
  }: DataAPIMigrationsConfig) {
    this.cwd = cwd || process.cwd();
    this.dataAPI = dataAPI;
    this.migrationAPI = migrationAPI;
    this.compiler = TypeScriptCompiler;
    this.migrationsPath = path.join(this.cwd, migrationsFolder || 'migrations');
    this.buildPath = path.join(this.cwd, '.migrations_build')
  }

  public async getAppliedMigrationIds (): Promise<string[]> {
    const result = await this.migrationAPI.fetchMigrations();
    return result.items.map(it => it.migration_id);
  }

  public async applyMigrations (): Promise<string[]> {
    const [migrations, compiler] = await this.bootstrap();
    const migrationsToRun = migrations.filter((migration) => !migration.isApplied);
    try {
      for (let i = 0; i < migrationsToRun.length; i ++) {
        // this.log(`Applying ${migrationsToRun[i].id} - ${migrationsToRun[i].name}`)
        await migrationsToRun[i].apply()
      }
      return migrationsToRun.map((migration) => migration.id)
    } finally {
      await compiler.cleanup()
    }
  }

  public async rollbackMigrations (): Promise<string[]> {
    const [migrations, compiler] = await this.bootstrap();
    const migrationsToRun = migrations.filter((migration) => migration.isApplied).slice(-1, migrations.length);
    try {
      for (let i = 0; i < migrationsToRun.length; i++) {
        // this.log(`Rolling back ${migrationsToRun[i].id} - ${migrationsToRun[i].name}`)
        await migrationsToRun[i].rollback()
      }
      return migrationsToRun.map((migration) => migration.id)
    } finally {
      await compiler.cleanup()
    }
  }

  private async bootstrap (): Promise<[Migration[], Compiler]> {
    const compiler = new TypeScriptCompiler({
      cwd: this.cwd,
      migrationsPath: this.migrationsPath,
      buildPath: this.buildPath
      // logger: this.log.bind(this)
    });
    const appliedMigrationIds = await this.getAppliedMigrationIds();
    let files = await compiler.compile();
    if(files === undefined) {
      files = [];
    }
    const migrations =
      files
      .map((file) => {
        const fileName = path.basename(file, '.js');
        const match = fileName.match(/^(?<id>\d{14})_(?<name>\w+)/);
        if (!match || !match.groups || !match.groups.id || !match.groups.name) {
          return null
        } else {
          const id = match.groups.id;
          const name = match.groups.name;
          return { id, name, file }
        }
      })
      .filter((data) => data !== null)
      .sort((a, b) => parseInt(a.id) - parseInt(b.id))
      .map(({ id, ...data }) => new Migration({
        id,
        ...data,
        isApplied: appliedMigrationIds.includes(id),
        dataAPI: this.dataAPI.apiClient,
        migrationAPI: this.migrationAPI.apiClient
      }));
    return [migrations, compiler]
  }

  // private async ensureMigrationTable (): Promise<void> {
  //   // await this.dataAPI.query(
  //   //   'CREATE TABLE IF NOT EXISTS __migrations__ (id varchar NOT NULL UNIQUE)',
  //   //   undefined,
  //   //   { includeResultMetadata: false }
  //   // )
  // }

  // private log (message: string): void {
  //   // if (typeof this.logger === 'function') {
  //   //   this.logger(message)
  //   // }
  // }
// }
}
export default ApiLogicDataMigration

