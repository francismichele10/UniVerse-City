import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  collection, doc, serverTimestamp, setDoc, updateDoc, deleteDoc, writeBatch,
} from 'firebase/firestore';

const projectId = 'demo-universe-city';
let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

after(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'admins/admin@example.com'), { email: 'admin@example.com' });
  });
});

function signedIn(uid = 'student-uid-001', email = 'student@example.com') {
  return testEnv.authenticatedContext(uid, { email }).firestore();
}

async function createProfile(db, uid = 'student-uid-001', username = 'student_001') {
  const batch = writeBatch(db);
  batch.set(doc(db, 'communityUsernames', username), {
    uid, username, createdAt: serverTimestamp(),
  });
  batch.set(doc(db, 'communityProfiles', uid), {
    uid, displayName: 'Test Student', username, photoURL: null,
    verified: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

async function createPost(db, uid = 'student-uid-001') {
  const ref = doc(collection(db, 'communityPosts'));
  await setDoc(ref, {
    text: 'A test community post',
    authorUid: uid,
    authorName: 'Test Student',
    authorPhotoURL: null,
    status: 'published',
    createdAt: serverTimestamp(),
  });
  return ref;
}

async function createComment(db, uid = 'student-uid-001', postId = 'post-001') {
  const ref = doc(collection(db, 'comments'));
  await setDoc(ref, {
    postId, postSlug: 'test-post', postTitle: 'Test Post',
    authorUid: uid, authorName: 'Test Student', authorPhotoURL: null,
    text: 'A test comment', parentId: null, createdAt: serverTimestamp(),
  });
  return ref;
}

describe('Community Firestore security rules', () => {
  it('blocks unauthenticated profile, post and comment creation', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(createProfile(db));
    await assertFails(createPost(db));
    await assertFails(createComment(db));
  });

  it('allows a student to create a unique profile and matching username reservation', async () => {
    const db = signedIn();
    await assertSucceeds(createProfile(db));
  });

  it('prevents students from self-verifying or changing their registered identity', async () => {
    const db = signedIn();
    await createProfile(db);
    await assertFails(updateDoc(doc(db, 'communityProfiles/student-uid-001'), {
      verified: true, updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(doc(db, 'communityProfiles/student-uid-001'), {
      displayName: 'Changed Name', updatedAt: serverTimestamp(),
    }));
  });

  it('allows a profiled student to publish a text post and comment', async () => {
    const db = signedIn();
    await createProfile(db);
    const post = await createPost(db);
    await assertSucceeds(createComment(db, 'student-uid-001', post.id));
  });

  it('enforces a full suspension for both posting and commenting', async () => {
    const db = signedIn();
    await createProfile(db);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'accountRestrictions/student-uid-001'), {
        active: true, mode: 'full', expiresAt: null,
      });
    });
    await assertFails(createPost(db));
    await assertFails(createComment(db));
  });

  it('enforces a posting-only restriction while allowing comments', async () => {
    const db = signedIn();
    await createProfile(db);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'accountRestrictions/student-uid-001'), {
        active: true, mode: 'post', expiresAt: null,
      });
    });
    await assertFails(createPost(db));
    await assertSucceeds(createComment(db));
  });

  it('enforces a commenting-only restriction while allowing posts', async () => {
    const db = signedIn();
    await createProfile(db);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'accountRestrictions/student-uid-001'), {
        active: true, mode: 'comment', expiresAt: null,
      });
    });
    await assertSucceeds(createPost(db));
    await assertFails(createComment(db));
  });

  it('allows owners to delete their posts but prevents another student from doing so', async () => {
    const owner = signedIn();
    await createProfile(owner);
    const post = await createPost(owner);
    const other = signedIn('another-student-uid', 'other@example.com');
    await assertFails(deleteDoc(doc(other, 'communityPosts', post.id)));
    await assertSucceeds(deleteDoc(doc(owner, 'communityPosts', post.id)));
  });

  it('allows only admins to change post moderation status and write audit logs', async () => {
    const owner = signedIn();
    await createProfile(owner);
    const post = await createPost(owner);
    await assertFails(updateDoc(doc(owner, 'communityPosts', post.id), { status: 'hidden' }));
    const admin = signedIn('admin-uid', 'admin@example.com');
    await assertSucceeds(updateDoc(doc(admin, 'communityPosts', post.id), { status: 'hidden' }));
    const logRef = doc(admin, 'moderationLogs', 'test-log');
    await assertSucceeds(setDoc(logRef, {
      actorEmail: 'admin@example.com', action: 'community_post_hidden',
      targetUid: 'student-uid-001', reason: 'Test moderation action', createdAt: serverTimestamp(),
    }));
    await assertFails(setDoc(doc(owner, 'moderationLogs', 'student-log'), {
      actorEmail: 'student@example.com', action: 'forged_action',
      targetUid: 'student-uid-001', createdAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(logRef, { reason: 'Tampered log' }));
    await assertFails(deleteDoc(logRef));
  });
});
