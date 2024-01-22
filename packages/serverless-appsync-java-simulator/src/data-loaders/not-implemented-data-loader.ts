/* eslint-disable class-methods-use-this */
export class NotImplementedDataLoader {
  constructor(private config: any) {}

  async load() {
    console.log(`Data Loader not implemented for ${this.config.type} (${this.config.name})`);

    return null;
  }
}
