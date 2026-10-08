import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { backupTimestampFromUri } from '../../src/utils/automaticBackupNames';

describe('automatic backup file names', () => {
  it('reads the timestamp from a canonical backup file in a SAF folder', () => {
    const uri = 'content://com.android.externalstorage.documents/tree/primary%3ADownload%2Flifts/document/primary%3ADownload%2Flifts%2Flifts-backup-20261008120000000.json';
    assert.equal(backupTimestampFromUri(uri), '20261008120000000');
  });

  it('ignores files that only contain the backup name', () => {
    const prefixed = 'content://com.android.externalstorage.documents/tree/primary%3ADownload%2Flifts/document/primary%3ADownload%2Flifts%2Fold-lifts-backup-20261008120000000.json';
    const suffixed = 'content://com.android.externalstorage.documents/tree/primary%3ADownload%2Flifts/document/primary%3ADownload%2Flifts%2Flifts-backup-20261008120000000.json.bak';
    assert.equal(backupTimestampFromUri(prefixed), null);
    assert.equal(backupTimestampFromUri(suffixed), null);
  });

  it('ignores files whose folder name contains the backup name', () => {
    const uri = 'content://com.android.externalstorage.documents/tree/primary%3Alifts-backup-20261008120000000.json%2Fold/document/primary%3ALifts%2Fnotes.txt';
    assert.equal(backupTimestampFromUri(uri), null);
  });

  it('returns null for a malformed encoded URI instead of throwing', () => {
    assert.equal(backupTimestampFromUri('content://tree/%E0%A4%A'), null);
  });
});
