export abstract class Compiler {
  public readonly cwd: string;
  public readonly migrationsPath: string;
  public readonly buildPath: string;
  // public readonly logger: Function

  constructor ({
    cwd, 
    migrationsPath, 
    buildPath, 
    // logger
  }: {
    cwd: string;
    migrationsPath: string;
    buildPath: string;
    // logger: Function;
  }) {
    this.cwd = cwd;
    this.migrationsPath = migrationsPath;
    this.buildPath = buildPath;
    // this.logger = logger
  }

  abstract compile (): Promise<string[] | undefined>

  abstract cleanup (): Promise<void>
}