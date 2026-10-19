// Fallback entry point for Node tooling. Metro resolves db.native.ts on
// Android/iOS and db.web.ts on web; see docs/platform-dispatch.md.
export * from './contract';
export * from './db.native';
