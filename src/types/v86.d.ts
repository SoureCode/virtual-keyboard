declare module "v86" {
  export type V86Listener = (...args: unknown[]) => void;

  export interface V86Options {
    [key: string]: unknown;
  }

  export class V86 {
    constructor(options: V86Options);
    add_listener(event: string, cb: V86Listener): void;
    remove_listener(event: string, cb: V86Listener): void;
    serial0_send(data: string): void;
    stop(): Promise<void>;
    restart(): void;
  }

  const _default: typeof V86;
  export default _default;
}
