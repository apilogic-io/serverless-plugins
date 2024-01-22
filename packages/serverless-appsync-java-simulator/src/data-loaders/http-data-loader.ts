import axios from 'axios';
import { isObject, forEach } from 'lodash';
import { AppSyncSimulatorHttpConfig } from '../types';

const paramsSerializer = (params) => {
  const parts = [];

  forEach(params, (value, key) => {
    if (value === null || typeof value === 'undefined') {
      return;
    }

    let k = key;
    let v = value;
    if (Array.isArray(v)) {
      k += '[]';
    } else {
      v = [v];
    }

    forEach(v, (val) => {
      let finalValue = val;
      if (isObject(finalValue)) {
        finalValue = JSON.stringify(finalValue);
      }
      parts.push(`${k}=${finalValue}`);
    });
  });

  return parts.join('&');
};

export class HttpDataLoader {
  constructor(private config: AppSyncSimulatorHttpConfig) {}

  async load(req): Promise<any> {
    try {
      const { data, status, headers } = await axios.request({
        baseURL: this.config.config.endpoint,
        validateStatus: (status: number) => false,
        url: req.resourcePath,
        headers: req.params.headers,
        params: req.params.query,
        paramsSerializer,
        method: req.method.toLowerCase(),
        data: req.params.body,
      });

      return {
        headers,
        statusCode: status,
        body: JSON.stringify(data),
      };
    } catch (err) {
      console.log(err);
    }

    return null;
  }
}
