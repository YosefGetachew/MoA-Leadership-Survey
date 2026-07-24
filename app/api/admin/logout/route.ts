import { cookies } from "next/headers";
import { ADMIN_COOKIE } from "../../../admin-auth";

export async function POST() {
  (await cookies()).set(ADMIN_COOKIE, "", { httpOnly: true, sameSite: "strict", path: "/", maxAge: 0 });
  return Response.json({ authorized: false });
}
