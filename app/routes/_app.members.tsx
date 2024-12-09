import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { createServerClient } from "@supabase/auth-helpers-remix";
import { UserPlus, Trash2 } from "lucide-react";
import { z } from "zod";

const inviteSchema = z.object({
  email: z.string().email("有効なメールアドレスを入力してください"),
  full_name: z.string().min(1, "名前を入力してください"),
});

export const action = async ({ request }: ActionFunctionArgs) => {
  const response = new Response();
  const supabase = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    { request, response }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user?.id)
    .single();

  if (!profile?.is_admin) {
    return json({ error: "管理者以外は実行できません" });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "invite") {
    const result = inviteSchema.safeParse({
      email: formData.get("email"),
      full_name: formData.get("full_name"),
    });

    if (!result.success) {
      return json({ errors: result.error.flatten().fieldErrors });
    }

    // 本来はここでSlack APIを使用してワークスペースのメンバーかどうかを確認する
    // 今回は省略してメール認証のみで招待を行う

    const { error: signupError } = await supabase.auth.signInWithOtp({
      email: result.data.email,
      options: {
        data: {
          full_name: result.data.full_name,
        },
      },
    });

    if (signupError) {
      return json({ error: "招待メールの送信に失敗しました" });
    }
  }

  if (intent === "delete") {
    const userId = formData.get("user_id") as string;
    
    const { error } = await supabase
      .from("profiles")
      .delete()
      .eq("id", userId);

    if (error) {
      return json({ error: "メンバーの削除に失敗しました" });
    }
  }

  return json({ success: true });
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const response = new Response();
  const supabase = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    { request, response }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user?.id)
    .single();

  if (!profile?.is_admin) {
    throw new Error("管理者以外はアクセスできません");
  }

  const { data: members } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at");

  return json(
    { members },
    {
      headers: response.headers,
    }
  );
};

export default function Members() {
  const { members } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">メンバー管理</h1>
        <button
          type="button"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center gap-2"
          onClick={() => {
            const dialog = document.getElementById("invite-member") as HTMLDialogElement;
            dialog.showModal();
          }}
        >
          <UserPlus className="w-5 h-5" />
          メンバーを招待
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                名前
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                メールアドレス
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                権限
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {members?.map((member) => (
              <tr key={member.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  {member.full_name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {member.email}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {member.is_admin ? "管理者" : "一般"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <Form method="post" className="inline">
                    <input type="hidden" name="user_id" value={member.id} />
                    <button
                      type="submit"
                      name="intent"
                      value="delete"
                      className="text-red-600 hover:text-red-900"
                      onClick={(e) => {
                        if (!confirm("このメンバーを削除してもよろしいですか？")) {
                          e.preventDefault();
                        }
                      }}
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </Form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dialog id="invite-member" className="rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-bold mb-4">メンバーを招待</h3>
        <Form method="post" className="space-y-4">
          <div>
            <label htmlFor="full_name" className="block text-sm font-medium mb-1">名前</label>
            <input
              type="text"
              id="full_name"
              name="full_name"
              required
              className="w-full rounded border-gray-300 shadow-sm"
            />
            {actionData && "errors" in actionData && actionData.errors?.full_name && (
              <p className="text-red-600 text-sm mt-1">{actionData.errors.full_name[0]}</p>
            )}
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">メールアドレス</label>
            <input
              type="email"
              name="email"
              required
              className="w-full rounded border-gray-300 shadow-sm"
            />
            {actionData && "errors" in actionData && actionData.errors?.email && (
              <p className="text-red-600 text-sm mt-1">{actionData.errors.email[0]}</p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
              onClick={() => {
                const dialog = document.getElementById("invite-member") as HTMLDialogElement;
                dialog.close();
              }}
            >
              キャンセル
            </button>
            <button
              type="submit"
              name="intent"
              value="invite"
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              招待する
            </button>
          </div>
        </Form>
      </dialog>
    </div>
  );
}