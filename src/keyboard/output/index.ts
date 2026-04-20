export type { OutputAdapter, KeyboardAction, CursorDirection } from "./types";
export { nativeAdapter } from "./native";
export {
  terminalAdapter,
  type TerminalSend,
  type TerminalAdapterOptions,
} from "./terminal";
