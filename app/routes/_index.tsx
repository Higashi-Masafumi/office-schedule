import { json, redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, useLoaderData, Form } from "@remix-run/react";
import { createServerClient } from "@supabase/auth-helpers-remix";
import { CalendarDays, ClipboardList, Users } from "lucide-react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const response = new Response();
  const supabase = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    { request, response }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", session.user.id)
    .single();

  return json(
    { user: session.user, isAdmin: profile?.is_admin },
    {
      headers: response.headers,
    }
  );
};

export default function AppLayout() {
  const { isAdmin } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-8">
              <Link
                to="/schedule"
                className="text-gray-700 hover:text-blue-600 flex items-center gap-2"
              >
                <CalendarDays className="w-5 h-5" />
                予定表
              </Link>
              {isAdmin && (
                <>
                  <Link
                    to="/reports"
                    className="text-gray-700 hover:text-blue-600 flex items-center gap-2"
                  >
                    <ClipboardList className="w-5 h-5" />
                    実績管理
                  </Link>
                  <Link
                    to="/members"
                    className="text-gray-700 hover:text-blue-600 flex items-center gap-2"
                  >
                    <Users className="w-5 h-5" />
                    メンバー管理
                  </Link>
                </>
              )}
            </div>
            <Form action="/logout" method="post">
              <button
                type="submit"
                className="text-gray-700 hover:text-blue-600"
              >
                ログアウト
              </button>
            </Form>
          </div>
        </div>
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  );
}