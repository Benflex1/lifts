// Node/test fallback entry point. Metro resolves saveBackup.native.ts on
// Android/iOS and saveBackup.web.ts on web; the base file only exists for Node
// tooling and never selects a variant at runtime. See docs/platform-dispatch.md.
export { getBackupFilename, type SaveBackupResult } from './saveBackupCommon';
export { saveBackupToFiles } from './saveBackup.web';
