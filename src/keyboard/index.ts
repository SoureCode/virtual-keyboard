export { VirtualKeyboard } from "./virtual-keyboard.js";
export { nativeAdapter } from "./output/native.js";
export {
  terminalAdapter,
  type TerminalSend,
  type TerminalAdapterOptions,
} from "./output/terminal.js";
export type {
  OutputAdapter,
  KeyboardAction,
  CursorDirection,
  Modifier,
} from "./output/types.js";
export type {
  Layout,
  Locale,
  Key,
  LayerId,
  KeyAction,
  Layer,
} from "./layouts/types.js";
