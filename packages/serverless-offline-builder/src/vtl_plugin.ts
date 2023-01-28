import * as path from 'path';
import * as fs from 'fs';

export const vtlPlugin = {
  name: 'vtl',
  setup(build) {
    // Intercept import paths called "env" so esbuild doesn't attempt
    // to map them to a file system location. Tag them with the "env-ns"
    // namespace to reserve them for this plugin.
    build.onResolve({ filter: /\.vtl$/ }, (args) => {
      return {
        path: path.resolve(args.resolveDir, args.path),
        namespace: 'vtl'
      }
    });

    // Load paths tagged with the "env-ns" namespace and behave as if
    // they point to a JSON file containing the environment variables.
    build.onLoad({ filter: /.*/, namespace: 'vtl' }, (args) => {
      const result = fs.readFileSync(args.path, 'utf-8')
      return {
        contents: result,
        loader: 'json'
      }
    });
  },
}