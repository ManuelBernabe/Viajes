/** Las traducciones de un texto escrito en español. */
export interface Translation {
  en: string;
  fr: string;
  it: string;
}

export type Messages = Record<string, Translation>;
