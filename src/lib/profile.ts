import { z } from "zod";
import type { Db } from "./db";
import type { User } from "./auth";
import { withUser } from "./rls";

const Exp = z.object({ title: z.string().trim().min(1).max(100), company: z.string().trim().max(100), from: z.string().max(20), to: z.string().max(20).optional(), details: z.string().max(2000).optional() });
const Edu = z.object({ school: z.string().trim().min(1).max(150), degree: z.string().trim().max(150), year: z.string().max(10).optional() });

export const ProfileInput = z.object({
  headline: z.string().trim().max(150).default(""),
  summary: z.string().trim().max(3000).default(""),
  location: z.string().trim().max(100).default(""),
  phone: z.string().trim().max(30).default(""),
  skills: z.array(z.string().trim().min(1).max(40)).max(50).default([]),
  experience: z.array(Exp).max(20).default([]),
  education: z.array(Edu).max(10).default([]),
});
export type ProfileData = z.infer<typeof ProfileInput>;

export const emptyProfile = (): ProfileData => ProfileInput.parse({});

export async function getProfile(db: Db, user: User): Promise<ProfileData> {
  const r = await withUser(db, user.id, async (tx) =>
    (await tx.query<ProfileData>("SELECT headline, summary, location, phone, skills, experience, education FROM profiles WHERE user_id=$1", [user.id])).rows[0]);
  return r ?? emptyProfile();
}

export async function saveProfile(db: Db, user: User, input: unknown): Promise<ProfileData> {
  const p = ProfileInput.parse(input);
  await withUser(db, user.id, (tx) => tx.query(
    `INSERT INTO profiles(user_id, headline, summary, location, phone, skills, experience, education, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
     ON CONFLICT (user_id) DO UPDATE SET headline=$2, summary=$3, location=$4, phone=$5, skills=$6, experience=$7, education=$8, updated_at=now()`,
    [user.id, p.headline, p.summary, p.location, p.phone, p.skills, JSON.stringify(p.experience), JSON.stringify(p.education)],
  ));
  return p;
}

export async function deleteAccountData(db: Db, user: User): Promise<void> {
  await db.query("DELETE FROM users WHERE id=$1", [user.id]); // cascades profiles, sessions
}
