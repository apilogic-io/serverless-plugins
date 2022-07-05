export abstract class Compiler {
  public readonly cwd: string;
  public readonly migrationsPath: string;
  public readonly buildPath: string;

  constructor({ cwd, migrationsPath, buildPath }: { cwd: string; migrationsPath: string; buildPath: string }) {
    this.cwd = cwd;
    this.migrationsPath = migrationsPath;
    this.buildPath = buildPath;
  }

  abstract compile(): Promise<string[] | undefined>;

  abstract cleanup(): Promise<void>;
}
