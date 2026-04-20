import type { Layout } from "./types";
import { bottomRow, numbersLayer, row, symbolsLayer } from "./shared";

const spaceLabel = "space";
const returnLabel = "return";

export const en: Layout = {
  locale: "en",
  spaceLabel,
  returnLabel,
  layers: {
    letters: {
      id: "letters",
      rows: [
        row("qwertyuiop"),
        row("asdfghjkl"),
        [
          { label: "⇧", action: { kind: "shift" } },
          ...row("zxcvbnm"),
          { label: "⌫", action: { kind: "backspace" } },
        ],
        bottomRow("123", "numbers", spaceLabel, returnLabel),
      ],
    },
    numbers: numbersLayer(spaceLabel, returnLabel),
    symbols: symbolsLayer(spaceLabel, returnLabel),
  },
};
