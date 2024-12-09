import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { createServerClient } from "@supabase/auth-helpers-remix";
import { format, startOfWeek, addDays, parseISO, isAfter } from "date-fns";
import { ja } from "date-fns/locale";
import { Clock, MapPin } from "lucide-react";
import { z } from "zod";

const scheduleSchema = z.object({
  start_time: z.string(),
  end_time: z.string(),
  location: z.string().min(1, "場所を入力してください"),
  description: z.string().min(1, "業務内容を入力してください"),
});

const reportSchema = z.object({
  actual_start_time: z.string(),
  actual_end_time: z.string(),
  break_time: z.string(),
  actual_description: z.string().min(1, "業務内容を入力してください"),
  reflection: z.string().min(1, "振り返りを入力してください"),
});

export const action = async ({ request }: ActionFunctionArgs) => {
  const response = new Response();
  const supabase = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    { request, response }
  );

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create") {
    const result = scheduleSchema.safeParse({
      start_time: formData.get("start_time"),
      end_time: formData.get("end_time"),
      location: formData.get("location"),
      description: formData.get("description"),
    });

    if (!result.success) {
      return json({ errors: result.error.flatten().fieldErrors });
    }

    const { data: { user } } = await supabase.auth.getUser();
    
    const { error } = await supabase.from("schedules").insert({
      user_id: user?.id,
      ...result.data,
    });

    if (error) {
      return json({ error: "予定の登録に失敗しました" });
    }
  }

  if (intent === "report") {
    const scheduleId = formData.get("schedule_id") as string;
    const result = reportSchema.safeParse({
      actual_start_time: formData.get("actual_start_time"),
      actual_end_time: formData.get("actual_end_time"),
      break_time: formData.get("break_time"),
      actual_description: formData.get("actual_description"),
      reflection: formData.get("reflection"),
    });

    if (!result.success) {
      return json({ errors: result.error.flatten().fieldErrors });
    }

    const { error } = await supabase.from("reports").insert({
      schedule_id: scheduleId,
      ...result.data,
    });

    if (error) {
      return json({ error: "実績の登録に失敗しました" });
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

  const { data: schedules } = await supabase
    .from("schedules")
    .select("*, reports(*)")
    .eq("user_id", user?.id)
    .order("start_time");

  return json(
    { schedules },
    {
      headers: response.headers,
    }
  );
};

export default function Schedule() {
  const { schedules } = useLoaderData<typeof loader>();
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekDays = [...Array(7)].map((_, i) => addDays(weekStart, i));

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">週間予定表</h1>
        <button
          type="button"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          onClick={() => {
            const dialog = document.getElementById("new-schedule") as HTMLDialogElement;
            dialog.showModal();
          }}
        >
          新規予定登録
        </button>
      </div>
      
      <div className="grid grid-cols-7 gap-4">
        {weekDays.map((day) => (
          <div
            key={day.toISOString()}
            className="border rounded-lg p-4 bg-white"
          >
            <h2 className="font-semibold text-center mb-2">
              {format(day, "M/d (E)", { locale: ja })}
            </h2>
            <div className="space-y-2">
              {schedules
                ?.filter(
                  (schedule) =>
                    format(new Date(schedule.start_time), "yyyy-MM-dd") ===
                    format(day, "yyyy-MM-dd")
                )
                .map((schedule) => (
                  <div
                    key={schedule.id}
                    className="p-2 bg-blue-50 rounded border border-blue-200"
                  >
                    <div className="text-sm font-medium flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {format(new Date(schedule.start_time), "HH:mm")} -{" "}
                      {format(new Date(schedule.end_time), "HH:mm")}
                    </div>
                    <div className="text-sm flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      {schedule.location}
                    </div>
                    <div className="text-sm text-gray-600">
                      {schedule.description}
                    </div>
                    {isAfter(new Date(), parseISO(schedule.end_time)) && !schedule.reports?.[0] && (
                      <button
                        type="button"
                        className="mt-2 w-full bg-green-600 text-white px-2 py-1 rounded text-sm hover:bg-green-700"
                        onClick={() => {
                          const dialog = document.getElementById(`report-${schedule.id}`) as HTMLDialogElement;
                          dialog.showModal();
                        }}
                      >
                        実績報告
                      </button>
                    )}
                    {schedule.reports?.[0] && (
                      <div className="mt-2 text-sm text-gray-500">
                        報告済み
                      </div>
                    )}

                    <dialog id={`report-${schedule.id}`} className="rounded-lg p-6 w-full max-w-md">
                      <h3 className="text-lg font-bold mb-4">実績報告</h3>
                      <Form method="post" className="space-y-4">
                        <input type="hidden" name="schedule_id" value={schedule.id} />
                        <div>
                          <label htmlFor={`actual_start_time-${schedule.id}`} className="block text-sm font-medium mb-1">実際の開始時間</label>
                          <input
                            type="time"
                            id={`actual_start_time-${schedule.id}`}
                            name="actual_start_time"
                            required
                            className="w-full rounded border-gray-300 shadow-sm"
                          />
                        </div>
                        <div>
                          <label htmlFor={`actual_end_time-${schedule.id}`} className="block text-sm font-medium mb-1">実際の終了時間</label>
                          <input
                            type="time"
                            id={`actual_end_time-${schedule.id}`}
                            name="actual_end_time"
                            required
                            className="w-full rounded border-gray-300 shadow-sm"
                          />
                        </div>
                        <div>
                          <label htmlFor={`break_time-${schedule.id}`} className="block text-sm font-medium mb-1">休憩時間（分）</label>
                          <input
                            type="number"
                            name="break_time"
                            required
                            min="0"
                            step="15"
                            className="w-full rounded border-gray-300 shadow-sm"
                          />
                        </div>
                        <div>
                          <label htmlFor={`actual_description-${schedule.id}`} className="block text-sm font-medium mb-1">実際の業務内容</label>
                          <textarea
                            name="actual_description"
                            required
                            className="w-full rounded border-gray-300 shadow-sm"
                            rows={3}
                          />
                        </div>
                        <div>
                          <label htmlFor={`reflection-${schedule.id}`} className="block text-sm font-medium mb-1">振り返り</label>
                          <textarea
                            id={`reflection-${schedule.id}`}
                            name="reflection"
                            required
                            className="w-full rounded border-gray-300 shadow-sm"
                            rows={3}
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                            onClick={() => {
                              const dialog = document.getElementById(`report-${schedule.id}`) as HTMLDialogElement;
                              dialog.close();
                            }}
                          >
                            キャンセル
                          </button>
                          <button
                            type="submit"
                            name="intent"
                            value="report"
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                          >
                            報告する
                          </button>
                        </div>
                      </Form>
                    </dialog>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>

      <dialog id="new-schedule" className="rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-bold mb-4">新規予定登録</h3>
        <Form method="post" className="space-y-4">
          <div>
            <label htmlFor="start_time" className="block text-sm font-medium mb-1">開始時間</label>
            <input
              type="datetime-local"
              id="start_time"
              name="start_time"
              required
              className="w-full rounded border-gray-300 shadow-sm"
            />
          </div>
          <div>
            <label htmlFor="end_time" className="block text-sm font-medium mb-1">終了時間</label>
            <input
              type="datetime-local"
              id="end_time"
              name="end_time"
              required
              className="w-full rounded border-gray-300 shadow-sm"
            />
          </div>
          <div>
            <label htmlFor="location" className="block text-sm font-medium mb-1">場所</label>
            <input
              type="text"
              id="location"
              name="location"
              required
              className="w-full rounded border-gray-300 shadow-sm"
            />
          </div>
          <div>
            <label htmlFor="description" className="block text-sm font-medium mb-1">業務内容</label>
            <textarea
              id="description"
              name="description"
              required
              className="w-full rounded border-gray-300 shadow-sm"
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
              onClick={() => {
                const dialog = document.getElementById("new-schedule") as HTMLDialogElement;
                dialog.close();
              }}
            >
              キャンセル
            </button>
            <button
              type="submit"
              name="intent"
              value="create"
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              登録する
            </button>
          </div>
        </Form>
      </dialog>
    </div>
  );
}