export type JavaInvocationRequest = {
  srcRoot: string;
  runtime: string;
  handler: string;
  event: string;
  envVars?: {
    [key: string]: string;
  };
  package: string;
  debug: boolean;
};
