export const GP_RELEASE_NOTE_LIMIT = 500;

export function releaseNoteErrors(notes: Record<string, string>): string[] {
  return Object.entries(notes).flatMap(([language, text]) =>
    text.length > GP_RELEASE_NOTE_LIMIT
      ? [`${language}: ${text.length}/${GP_RELEASE_NOTE_LIMIT} characters.`]
      : [],
  );
}

/** Format accepted by Play Console's multi-language release-notes field. */
export function formatPlayConsoleReleaseNotes(notes: Record<string, string>): string {
  return Object.entries(notes)
    .filter(([, value]) => value.trim().length > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([language, value]) => `<${language}>\n${value.trim()}\n</${language}>`)
    .join("\n\n");
}
