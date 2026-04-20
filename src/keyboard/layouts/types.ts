export type KeyAction =
  | { kind: "char"; value: string }
  | { kind: "backspace" }
  | { kind: "shift" }
  | { kind: "layer"; id: LayerId }
  | { kind: "globe" }
  | { kind: "space" }
  | { kind: "return" };

export type Key = {
  label: string;
  action: KeyAction;
  flex?: number;
  wide?: boolean;
  fill?: boolean;
};

export type LayerId = "letters" | "numbers" | "symbols";

export type Layer = {
  id: LayerId;
  rows: Key[][];
};

export type Layout = {
  locale: Locale;
  spaceLabel: string;
  returnLabel: string;
  layers: Record<LayerId, Layer>;
};

export type Locale = "en" | "de";
