import * as execa from 'execa';
import * as path from 'path';
import { packageName, relativeShimJarPath } from './constants';
import { pathManager } from './pathManager';
import { JavaInvocationRequest } from './invocation.request';

export const invokeResource = async (request: JavaInvocationRequest, context: any) => {
  const [handlerClassName, handlerMethodName] = request.handler.split('::');
  const debugMode = process.env.JAVA_LAMBDA_DEBUG && process.env.JAVA_LAMBDA_DEBUG === 'true' ? 'y' : 'n';
  let debug = `-agentlib:jdwp=transport=dt_socket,server=y,suspend=${debugMode},address=*:5005`;
  if (request.debug) {
    debug = '-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=*:5005';
  }
  const childProcess = execa(
    'java',
    [
      '-jar',
      debug,
      path.join(pathManager.getAmplifyPackageLibDirPath(packageName), relativeShimJarPath),
      path.join(request.srcRoot, request.package),
      handlerClassName,
      handlerMethodName,
    ],
    {
      input: request.event,
      env: { PATH: process.env.PATH, ...request.envVars }, // Java relies on PATH so we have to add that into the env
      extendEnv: false,
    }
  );
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
