import type { Layout, Locale } from "./types";
import { en } from "./en";
import { de } from "./de";

export const layouts: Record<Locale, Layout> = { en, de };

export const locales: Locale[] = ["en", "de"];

export const isLocale = (v: string): v is Locale =>
  (locales as string[]).includes(v);

export type { Layout, Locale, Key, LayerId, KeyAction } from "./types";
