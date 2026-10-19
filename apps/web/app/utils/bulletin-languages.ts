/** Languages offered for bulletin editions, named in their own language. */
export const BULLETIN_LANGUAGES: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'pt', name: 'Português' },
  { code: 'fr', name: 'Français' },
  { code: 'to', name: 'Lea faka-Tonga' },
  { code: 'sm', name: 'Gagana Samoa' },
  { code: 'zh', name: '中文' },
  { code: 'ko', name: '한국어' },
  { code: 'vi', name: 'Tiếng Việt' },
];

export function bulletinLanguageName(code: string): string {
  return BULLETIN_LANGUAGES.find((language) => language.code === code)?.name ?? code;
}
