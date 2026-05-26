/**
 * teacher.js — Teacher/Class helpers for BM Vocab
 *
 * Firestore additions for Phase C:
 *
 * /users/{uid}
 *   role: "student" | "teacher"   (new field)
 *
 * /classes/{classId}
 *   name, joinCode (6-char uppercase), teacherUid, teacherName,
 *   createdAt, packIds: string[]   (assigned packs)
 *
 * /classes/{classId}/members/{studentUid}
 *   displayName, xp, schoolLevel, schoolYearNum, joinedAt
 *
 * /users/{uid}
 *   classId: string | null        (student's enrolled class)
 */

import { db, auth } from "./firebase.js";
import {
  doc, getDoc, setDoc, updateDoc, collection,
  query, where, getDocs, serverTimestamp, deleteDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─── Utilities ───────────────────────────────────────────────────────────────

/** Generate a 6-char alphanumeric join code */
export function generateJoinCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusable chars
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ─── Role ─────────────────────────────────────────────────────────────────────

/** Promote current user to teacher role */
export async function setTeacherRole() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not signed in");
  await updateDoc(doc(db, "users", uid), { role: "teacher" });
}

/** Get current user's role ("student" | "teacher" | null) */
export async function getMyRole() {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? (snap.data().role ?? "student") : null;
}

// ─── Class Management (Teacher) ───────────────────────────────────────────────

/**
 * Create a new class. Returns the new classId.
 */
export async function createClass(className) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not signed in");

  const user = await getDoc(doc(db, "users", uid));
  const teacherName = user.data()?.displayName ?? "Cikgu";

  // Ensure unique join code
  let joinCode;
  let attempts = 0;
  do {
    joinCode = generateJoinCode();
    const existing = await getDocs(
      query(collection(db, "classes"), where("joinCode", "==", joinCode))
    );
    if (existing.empty) break;
  } while (++attempts < 10);

  const classRef = doc(collection(db, "classes"));
  await setDoc(classRef, {
    name: className,
    joinCode,
    teacherUid: uid,
    teacherName,
    createdAt: serverTimestamp(),
    packIds: [],
  });

  // Link class to teacher's user doc
  await updateDoc(doc(db, "users", uid), { classId: classRef.id, role: "teacher" });

  return { classId: classRef.id, joinCode };
}

/**
 * Update the name of a class the current user owns.
 */
export async function renameClass(classId, newName) {
  const uid = auth.currentUser?.uid;
  await updateDoc(doc(db, "classes", classId), { name: newName });
}

/**
 * Assign pack IDs to a class.
 */
export async function assignPacksToClass(classId, packIds) {
  await updateDoc(doc(db, "classes", classId), { packIds });
}

/**
 * Get class doc by classId.
 */
export async function getClass(classId) {
  const snap = await getDoc(doc(db, "classes", classId));
  return snap.exists() ? { classId: snap.id, ...snap.data() } : null;
}

/**
 * Get the class managed by the current teacher.
 */
export async function getMyClass() {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  const snap = await getDoc(doc(db, "users", uid));
  const classId = snap.data()?.classId;
  if (!classId) return null;
  return getClass(classId);
}

/**
 * Get all members of a class with their progress summary.
 */
export async function getClassMembers(classId) {
  const snap = await getDocs(collection(db, "classes", classId, "members"));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

/**
 * Remove a student from a class (teacher action).
 */
export async function removeMemberFromClass(classId, studentUid) {
  const batch = writeBatch(db);
  batch.delete(doc(db, "classes", classId, "members", studentUid));
  batch.update(doc(db, "users", studentUid), { classId: null });
  await batch.commit();
}

// ─── Per-student progress (Teacher Dashboard) ─────────────────────────────────

/**
 * Get progress sub-collection for a student. Returns array of {wordId, status, updatedAt}.
 */
export async function getStudentProgress(studentUid) {
  const snap = await getDocs(collection(db, "users", studentUid, "progress"));
  return snap.docs.map(d => ({ wordId: d.id, ...d.data() }));
}

// ─── Join Class (Student) ─────────────────────────────────────────────────────

/**
 * Student joins a class by 6-char join code. Returns classId.
 */
export async function joinClass(joinCode) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not signed in");

  const upper = joinCode.trim().toUpperCase();
  const q = query(collection(db, "classes"), where("joinCode", "==", upper));
  const results = await getDocs(q);
  if (results.empty) throw new Error("Kod kelas tidak dijumpai. Semak semula.");

  const classDoc = results.docs[0];
  const classId = classDoc.id;

  // Get student info
  const userSnap = await getDoc(doc(db, "users", uid));
  const userData = userSnap.data() ?? {};

  const batch = writeBatch(db);
  // Add to class members
  batch.set(doc(db, "classes", classId, "members", uid), {
    displayName: userData.displayName ?? "Pelajar",
    xp: userData.xp ?? 0,
    schoolLevel: userData.schoolLevel ?? "primary",
    schoolYearNum: userData.schoolYearNum ?? 1,
    joinedAt: serverTimestamp(),
  });
  // Update student's user doc
  batch.update(doc(db, "users", uid), { classId });
  await batch.commit();

  return classId;
}

/**
 * Student leaves their current class.
 */
export async function leaveClass(classId) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const batch = writeBatch(db);
  batch.delete(doc(db, "classes", classId, "members", uid));
  batch.update(doc(db, "users", uid), { classId: null });
  await batch.commit();
}

/**
 * Sync student's latest XP into the class members sub-collection.
 * Call this after any XP award.
 */
export async function syncMemberXP(classId, xp) {
  const uid = auth.currentUser?.uid;
  if (!uid || !classId) return;
  await updateDoc(doc(db, "classes", classId, "members", uid), { xp });
}
