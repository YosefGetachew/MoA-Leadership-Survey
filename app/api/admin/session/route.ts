import { getStaffSession } from "../../../admin-auth";

export async function GET() {
  const session = await getStaffSession();
  return Response.json(session ? { authorized: true, ...session } : { authorized: false });
}
