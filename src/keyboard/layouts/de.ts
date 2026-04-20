import type { Layout } from "./types";
import { bottomRow, numbersLayer, row, symbolsLayer } from "./shared";

const spaceLabel = "Leerzeichen";
const returnLabel = "Return";

export const de: Layout = {
  locale: "de",
  spaceLabel,
  returnLabel,
  layers: {
    letters: {
      id: "letters",
      rows: [
        row("qwertzuiopü"),
        row("asdfghjklöä"),
        [
          { label: "⇧", action: { kind: "shift" } },
          ...row("yxcvbnm"),
          { label: "⌫", action: { kind: "backspace" } },
        ],
        bottomRow("123", "numbers", spaceLabel, returnLabel),
      ],
    },
    numbers: numbersLayer(spaceLabel, returnLabel),
    symbols: symbolsLayer(spaceLabel, returnLabel),
  },
};
