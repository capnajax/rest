declare module 'args-and-envs' {
  export default class Parser {
    constructor(defs: any, opts?: any);
    parse(): void;
    argv: any;
    errors?: any[];
  }
}
