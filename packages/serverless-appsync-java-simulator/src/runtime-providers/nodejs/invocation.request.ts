export type ServerlessLocalInvocationRequest = {
  functionName: string;
  config: string;
  data: string;
  event: string;
  envVars?: {
    [key: string]: string;
  };
};
