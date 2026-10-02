import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { InvalidInputError } from "@/lib/errors";

export const USER_ID_HEADER = "x-user-id";
export const USER_ID_COOKIE = "vsc_uid";

const userIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

export interface RequestUser {
  userId: string;
  /** True when we minted a new id and the response needs to set the cookie. */
  isNew: boolean;
}

/**
 * Demo-grade identity: an explicit `x-user-id` header wins (handy for curl and
 * tests), otherwise an anonymous id kept in a cookie. Anyone can claim any id,
 * which is acceptable for a demo but not for real billing. See the README.
 */
export function resolveUser(request: NextRequest): RequestUser {
  const header = request.headers.get(USER_ID_HEADER);
  if (header !== null) {
    const parsed = userIdSchema.safeParse(header);
    if (!parsed.success) {
      throw new InvalidInputError(`${USER_ID_HEADER} must be 1-64 characters of [A-Za-z0-9_-]`);
    }
    return { userId: parsed.data, isNew: false };
  }

  const cookie = userIdSchema.safeParse(request.cookies.get(USER_ID_COOKIE)?.value);
  if (cookie.success) return { userId: cookie.data, isNew: false };

  return { userId: randomUUID(), isNew: true };
}
