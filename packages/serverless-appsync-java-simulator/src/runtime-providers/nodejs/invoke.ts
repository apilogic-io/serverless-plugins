import { executorPath } from 'amplify-nodejs-function-runtime-provider/lib/utils/executorPath';
import { InvokeOptions } from 'amplify-nodejs-function-runtime-provider/lib/utils/invoke';
import * as execa from 'execa';
import { ServerlessLocalInvocationRequest } from './invocation.request';

export const invokeServerlessLocalResource = async (options: InvokeOptions, context: any) => {
  const childProcess = execa.node(executorPath, [], {
    env: options.environment,
    extendEnv: false,
    stdio: ['ignore', 'inherit', 'inherit', 'pipe'],
  });
  childProcess.send(options);
  // const childProcess = execa(
  //   'serverless',
  //   ['invoke', 'local', '-f', request.functionName, '--config', request.config, '--data', request.data],
  //   {
  //     input: request.event,
  //     env: { PATH: process.env.PATH, ...request.envVars }, // Java relies on PATH so we have to add that into the env
  //     extendEnv: false,
  //   }
  // );
  childProcess.stderr?.pipe(process.stderr);
  childProcess.stdout?.pipe(process.stdout);

  const { stdout, exitCode } = await childProcess;
  if (exitCode !== 0) {
    throw new Error('LambdaFunctionInvokeError' + { message: `java failed, exit code was ${exitCode}` });
  }
  const lines = stdout.split('\n');
  const lastLine = lines[lines.length - 1];
  let result = lastLine;
  try {
    result = JSON.parse(lastLine);
  } catch (err) {
    context.print.warning('Could not parse function output as JSON. Using raw output.');
  }
  return result;
};
