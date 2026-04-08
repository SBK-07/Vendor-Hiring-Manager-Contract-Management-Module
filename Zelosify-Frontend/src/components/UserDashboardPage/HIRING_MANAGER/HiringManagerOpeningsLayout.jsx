"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2, RefreshCcw } from "lucide-react";
import axiosInstance from "@/utils/Axios/AxiosInstance";

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-4 py-3"><div className="h-3 w-40 rounded bg-gray-200 dark:bg-gray-700" /></td>
      <td className="px-4 py-3"><div className="h-3 w-20 rounded bg-gray-200 dark:bg-gray-700" /></td>
      <td className="px-4 py-3"><div className="h-3 w-20 rounded bg-gray-200 dark:bg-gray-700" /></td>
      <td className="px-4 py-3"><div className="h-3 w-24 rounded bg-gray-200 dark:bg-gray-700" /></td>
      <td className="px-4 py-3"><div className="h-3 w-10 rounded bg-gray-200 dark:bg-gray-700" /></td>
      <td className="px-4 py-3"><div className="h-3 w-16 rounded bg-gray-200 dark:bg-gray-700" /></td>
    </tr>
  );
}

export default function HiringManagerOpeningsLayout() {
  const [openings, setOpenings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchOpenings = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await axiosInstance.get("/hiring-manager/openings");
      setOpenings(response?.data?.data || []);
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Failed to fetch openings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOpenings();
  }, []);

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Hiring Manager Openings</h1>
        <button
          type="button"
          onClick={fetchOpenings}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground"
        >
          <RefreshCcw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="rounded-lg border border-border bg-white p-4 dark:bg-[#111827]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">My Openings</h2>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-secondary" />}
        </div>

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-tableHeader">
              <tr>
                <th className="px-4 py-3 text-left text-xs text-secondary">Title</th>
                <th className="px-4 py-3 text-left text-xs text-secondary">Location</th>
                <th className="px-4 py-3 text-left text-xs text-secondary">Contract</th>
                <th className="px-4 py-3 text-left text-xs text-secondary">Status</th>
                <th className="px-4 py-3 text-left text-xs text-secondary">Profiles</th>
                <th className="px-4 py-3 text-left text-xs text-secondary">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}

              {!loading && openings.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-sm text-secondary" colSpan={6}>
                    No openings assigned to this hiring manager.
                  </td>
                </tr>
              )}

              {!loading && openings.map((opening) => (
                <tr key={opening.id} className="hover:bg-tableHeader/60">
                  <td className="px-4 py-3 text-sm text-foreground">{opening.title}</td>
                  <td className="px-4 py-3 text-sm text-foreground">{opening.location || "-"}</td>
                  <td className="px-4 py-3 text-sm text-foreground">{opening.contractType || "-"}</td>
                  <td className="px-4 py-3 text-sm text-foreground">{opening.status}</td>
                  <td className="px-4 py-3 text-sm text-foreground">{opening.profilesCount}</td>
                  <td className="px-4 py-3 text-sm">
                    <Link
                      href={`/hiring-manager/openings/${opening.id}`}
                      className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-tableHeader"
                    >
                      View Profiles
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
