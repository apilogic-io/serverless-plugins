import * as Serverless from 'serverless'
import * as Plugin from 'serverless/classes/Plugin'
import * as chalk from 'chalk'

import {ApiLogicDataMigration, DataApiClientModule} from "@apilogic/migration-tool-api";

interface Options extends Serverless.Options {
    name?: string;
}

class ApiLogicDataMigrationServerless implements Plugin {
    public hooks: Plugin.Hooks;
    public commands: Plugin.Commands;
    protected options: Options;
    protected serverless: Serverless;
    protected stage: string;

    constructor (serverless: Serverless, options: Options) {
        this.serverless = serverless;
        this.options = options;

        const commonOptions = {
            stage: {
                usage: 'The stage e.g. (local, dev, staging, prod, etc.)',
                required: false,
                default: 'local'
            }
        };

        this.stage = options.stage || 'local';
        const lifecycleEvents = this.stage === 'local' ? ['init', 'exec', 'end'] : ['exec'];

        this.commands = {
            migrations: {
                usage: 'Aurora Serverless DataAPI migration management.',
                lifecycleEvents: ['help'],
                commands: {
                    create: {
                        usage: 'Generate a new migration file.',
                        lifecycleEvents: ['generate'],
                        options: {
                            name: {
                                usage: 'Name of the migration e.g. sls migration create --name createUsersTable',
                                required: true,
                                shortcut: 'n'
                            }
                        }
                    },
                    apply: {
                        usage: 'Apply all pending migrations.',
                        lifecycleEvents,
                        options: {
                            ...commonOptions
                        }
                    },
                    rollback: {
                        usage: 'Rollback the most recent (applied) migration.',
                        lifecycleEvents,
                        options: {
                            ...commonOptions
                        }
                    },
                    status: {
                        usage: 'List the migrations that have been applied.',
                        lifecycleEvents,
                        options: {
                            ...commonOptions
                        }
                    }
                }
            }
        };

        this.hooks = {
            'migrations:apply:exec': this.applyMigrations.bind(this),
            'migrations:rollback:exec': this.rollbackMigrations.bind(this),
            'migrations:status:exec': this.fetchMigrationStatus.bind(this)
        }
    }

    private manager (): ApiLogicDataMigration {
        const baseConfig = this.serverless.service.custom['DataAPIMigrations'];
        const migrationHolderDatasource = this.serverless.service.custom['DataAPIMigrations'].migrationSourceClient;
        const migrationClientDatasource = this.serverless.service.custom['DataAPIMigrations'].migrationTargetClient;
        if (baseConfig === undefined) {
            throw new Error('"custom"."DataAPIMigrations" is missing from serverless.yml')
        }
        const {
            migrationsFolder = './migrations',
            client = new DataApiClientModule.DataApiClient(migrationClientDatasource),
            migrationClient = new DataApiClientModule.DataApiClient(migrationHolderDatasource)
        } = baseConfig;
        return new ApiLogicDataMigration({
            cwd: this.serverless.config.servicePath,
            migrationsFolder: migrationsFolder,
            dataAPI: client,
            migrationAPI: migrationClient
        });
    }

    private async applyMigrations (): Promise<void> {
        const ids = await this.manager().applyMigrations();
        ids.forEach((id) => this.log(`${chalk.bgBlue(id)} applied.`))
    }

    private async rollbackMigrations (): Promise<void> {
        const ids = await this.manager().rollbackMigrations();
        ids.forEach((id) => this.log(`${chalk.greenBright(id)} rolled back.`))
    }

    private async fetchMigrationStatus (): Promise<void> {
        const ids = await this.manager().getAppliedMigrationIds();
        ids.forEach((id) => this.log(`${chalk.greenBright(id)} is applied.`))
    }

    private log (message: string): void {
        this.serverless.cli.log(`${chalk.magentaBright('Data API Migrations:')} ${message}`)
    }
}

export = ApiLogicDataMigrationServerless
