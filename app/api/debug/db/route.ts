import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const connectionInfo = await db.$queryRaw<
      Array<{
        current_database: string;
        current_user: string;
        inet_server_port: number;
      }>
    >`
      SELECT
        current_database(),
        current_user,
        inet_server_port();
    `;

    const columnCheck = await db.$queryRaw<
      Array<{
        column_name: string | null;
        data_type: string | null;
        column_default: string | null;
      }>
    >`
      SELECT
        column_name,
        data_type,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Agent'
        AND column_name = 'tokenVersion';
    `;

    return NextResponse.json({
      success: true,
      connection: connectionInfo[0] ?? null,
      tokenVersionColumn: columnCheck[0] ?? null,
    });
  } catch (error) {
    console.error("DB debug error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown database error",
      },
      { status: 500 }
    );
  }
}