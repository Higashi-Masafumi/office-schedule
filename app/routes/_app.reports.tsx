import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { createServerClient } from "@supabase/auth-helpers-remix";
import { format, parseISO, differenceInMinutes } from "date-fns";
import { ja } from "date-fns/locale";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const response = new Response();
  const supabase = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    { request, response }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user?.id)
    .single();

  if (!profile?.is_admin) {
    throw new Error("管理者以外はアクセスできません");
  }

  const url = new URL(request.url);
  const year =
    url.searchParams.get("year") || new Date().getFullYear().toString();
  const month =
    url.searchParams.get("month") || (new Date().getMonth() + 1).toString();

  const { data: reports } = await supabase
    .from("reports")
    .select(
      `
      *,
      schedules (
        *,
        profiles (
          full_name
        )
      )
    `
    )
    .gte("actual_start_time", `${year}-${month.padStart(2, "0")}-01`)
    .lt(
      "actual_start_time",
      `${year}-${
        Number(month) + 1 === 13
          ? "01"
          : (Number(month) + 1).toString().padStart(2, "0")
      }-01`
    )
    .order("actual_start_time");

  return json(
    { reports, year, month },
    {
      headers: response.headers,
    }
  );
};

export default function Reports() {
  const { reports, year, month } = useLoaderData<typeof loader>();

  const reportsByUser: Record<
    string,
    { userName: string; reports: typeof reports; totalWorkMinutes: number }
  > = reports?.reduce(
    (
      acc,
      report: {
        schedules: { user_id: string; profiles: { full_name: string } };
        actual_end_time: string;
        actual_start_time: string;
        break_time: string;
      }
    ) => {
      const userId = report.schedules.user_id;
      if (!acc[userId]) {
        acc[userId] = {
          userName: report.schedules.profiles.full_name,
          reports: [],
          totalWorkMinutes: 0,
        };
      }

      const workMinutes =
        differenceInMinutes(
          parseISO(report.actual_end_time),
          parseISO(report.actual_start_time)
        ) - Number(report.break_time);

      acc[userId].reports.push(report);
      acc[userId].totalWorkMinutes += workMinutes;

      return acc;
    },
    {} as Record<
      string,
      { userName: string; reports: typeof reports; totalWorkMinutes: number }
    >
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">勤務実績管理</h1>
        <div className="flex gap-4">
          <select
            value={year}
            onChange={(e) => {
              const url = new URL(window.location.href);
              url.searchParams.set("year", e.target.value);
              window.location.href = url.toString();
            }}
            className="rounded border-gray-300"
          >
            {[...Array(5)].map((_, i) => {
              const y = new Date().getFullYear() - 2 + i;
              return (
                <option key={y} value={y}>
                  {y}年
                </option>
              );
            })}
          </select>
          <select
            value={month}
            onChange={(e) => {
              const url = new URL(window.location.href);
              url.searchParams.set("month", e.target.value);
              window.location.href = url.toString();
            }}
            className="rounded border-gray-300"
          >
            {[...Array(12)].map((_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}月
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-8">
        {Object.entries(reportsByUser || {}).map(
          ([userId, { userName, reports, totalWorkMinutes }]) => (
            <div key={userId} className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">{userName}</h2>
                <div className="text-gray-600">
                  総労働時間: {Math.floor(totalWorkMinutes / 60)}時間
                  {totalWorkMinutes % 60}分
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="py-2 text-left">日付</th>
                      <th className="py-2 text-left">時間</th>
                      <th className="py-2 text-left">休憩</th>
                      <th className="py-2 text-left">場所</th>
                      <th className="py-2 text-left">業務内容</th>
                      <th className="py-2 text-left">振り返り</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports?.map((report) => {
                      const workMinutes =
                        differenceInMinutes(
                          parseISO(report.actual_end_time),
                          parseISO(report.actual_start_time)
                        ) - Number(report.break_time);

                      return (
                        <tr key={report.id} className="border-b">
                          <td className="py-2">
                            {format(
                              parseISO(report.actual_start_time),
                              "M/d (E)",
                              { locale: ja }
                            )}
                          </td>
                          <td className="py-2">
                            {format(
                              parseISO(report.actual_start_time),
                              "HH:mm"
                            )}{" "}
                            -{" "}
                            {format(parseISO(report.actual_end_time), "HH:mm")}
                            <div className="text-sm text-gray-500">
                              {Math.floor(workMinutes / 60)}時間
                              {workMinutes % 60}分
                            </div>
                          </td>
                          <td className="py-2">{report.break_time}分</td>
                          <td className="py-2">{report.schedules.location}</td>
                          <td className="py-2">{report.actual_description}</td>
                          <td className="py-2">{report.reflection}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
