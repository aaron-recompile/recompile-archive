"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { API_URL } from "../lib/api";

export default function DeleteSeriesButton({ id }: { id: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function deleteSeries() {
    if (
      !confirm(
        "Delete this series? All articles in it will also be deleted (cascade).",
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/series/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      router.push("/series");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
      setBusy(false);
    }
  }

  return (
    <button
      disabled={busy}
      onClick={deleteSeries}
      className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white px-3 py-1.5 rounded text-sm"
    >
      Delete series
    </button>
  );
}
