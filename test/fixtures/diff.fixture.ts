import type { FileDiffEntry, PullRequestOverlay } from '@visoagent/protocol';

export const mockFileDiffEntryAdded: FileDiffEntry = {
  path: 'src/features/new-feature.ts',
  status: 'added',
  insertions: 85,
  deletions: 0,
};

export const mockFileDiffEntryModified: FileDiffEntry = {
  path: 'src/main.ts',
  status: 'modified',
  insertions: 24,
  deletions: 6,
};

export const mockFileDiffEntryDeleted: FileDiffEntry = {
  path: 'src/legacy/old-util.ts',
  status: 'deleted',
  insertions: 0,
  deletions: 50,
};

export const mockFileDiffEntryRenamed: FileDiffEntry = {
  path: 'src/utils/new-name.ts',
  oldPath: 'src/utils/old-name.ts',
  status: 'renamed',
  insertions: 5,
  deletions: 2,
};

export const mockPullRequestOverlay: PullRequestOverlay = {
  cityId: 'pr-42',
  prNumber: 42,
  title: 'feat: add spatial audio engine and improve camera tweens',
  author: 'octocat',
  baseSha: '1111111111111111111111111111111111111111',
  headSha: '2222222222222222222222222222222222222222',
  changedFiles: [
    mockFileDiffEntryAdded,
    mockFileDiffEntryModified,
    mockFileDiffEntryDeleted,
    mockFileDiffEntryRenamed,
  ],
};

export const mockRawNumstatOutput = `85\t0\tsrc/features/new-feature.ts
24\t6\tsrc/main.ts
0\t50\tsrc/legacy/old-util.ts
5\t2\tsrc/utils/{old-name.ts => new-name.ts}
`;

export const mockRawNameStatusOutput = `A\tsrc/features/new-feature.ts
M\tsrc/main.ts
D\tsrc/legacy/old-util.ts
R100\tsrc/utils/old-name.ts\tsrc/utils/new-name.ts
`;

export const mockUnifiedDiff = `--- a/src/main.ts
+++ b/src/main.ts
@@ -1,5 +1,7 @@
-console.log("old");
+import { newFeature } from "./features/new-feature";
+console.log("new");
+newFeature();
`;
