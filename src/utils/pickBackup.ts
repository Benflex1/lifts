// Node/test fallback entry point. Metro resolves pickBackup.native.ts on
// Android/iOS and pickBackup.web.ts on web; the base file only exists for Node
// tooling and never selects a variant at runtime. See docs/platform-dispatch.md.
export { pickBackupJson } from './pickBackup.web';
