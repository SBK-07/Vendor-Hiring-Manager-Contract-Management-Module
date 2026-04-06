"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, RefreshCcw } from "lucide-react";
import axiosInstance from "@/utils/Axios/AxiosInstance";

export default function VendorOpeningsLayout() {
  const [openings, setOpenings] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState("");
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });

  const hasPrev = useMemo(() => pagination.page > 1, [pagination.page]);
  const hasNext = useMemo(
    () => pagination.page < pagination.totalPages,
    [pagination.page, pagination.totalPages]
  );

  const fetchOpenings = async (page = 1) => {
    setListLoading(true);
    setError("");

    try {
      const response = await axiosInstance.get(
        `/vendor/openings?page=${page}&limit=${pagination.limit}`
      );
      const data = response?.data?.data || [];
      const paging = response?.data?.pagination || {
        page,
        limit: pagination.limit,
        total: data.length,
        totalPages: 1,
      };

      setOpenings(data);
      setPagination(paging);
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Failed to load openings");
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    fetchOpenings();
  }, []);

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">IT Vendor Openings</h1>
        <button
          type="button"
          onClick={() => fetchOpenings(pagination.page)}
          className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-tableHeader"
        >
          <RefreshCcw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="rounded-lg border border-border bg-white p-4 dark:bg-[#111827]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Openings</h2>
          {listLoading && <Loader2 className="h-4 w-4 animate-spin text-secondary" />}
        </div>

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-tableHeader">
              <tr>
                <th className="px-4 py-3 text-left text-xs text-secondary">Title</th>
                <th className="px-4 py-3 text-left text-xs text-secondary">Location</th>
                <th className="px-4 py-3 text-left text-xs text-secondary">Contract Type</th>
                <th className="px-4 py-3 text-left text-xs text-secondary">Posted Date</th>
                <th className="px-4 py-3 text-left text-xs text-secondary">Hiring Manager Name</th>
                <th className="px-4 py-3 text-left text-xs text-secondary">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!listLoading && openings.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-sm text-secondary" colSpan={6}>
                    No openings found for your tenant.
                  </td>
                </tr>
              )}

              {openings.map((opening) => (
                <tr key={opening.id} className="hover:bg-tableHeader/60">
                  <td className="px-4 py-3 text-sm text-foreground">{opening.title}</td>
                  <td className="px-4 py-3 text-sm text-foreground">
                    {opening.location || "-"}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground">
                    {opening.contractType || "-"}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground">
                    {new Date(opening.postedDate).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground">
                    {opening.hiringManagerName}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <Link
                      href={`/vendor/openings/${opening.id}`}
                      className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-tableHeader"
                    >
                      View Details
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-secondary">
            Page {pagination.page} of {Math.max(pagination.totalPages, 1)} • {pagination.total} opening(s)
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!hasPrev || listLoading}
              onClick={() => fetchOpenings(pagination.page - 1)}
              className="inline-flex items-center rounded-md border border-border px-2 py-1 text-xs text-foreground disabled:opacity-50"
            >
              <ChevronLeft className="h-3 w-3" /> Prev
            </button>
            <button
              type="button"
              disabled={!hasNext || listLoading}
              onClick={() => fetchOpenings(pagination.page + 1)}
              className="inline-flex items-center rounded-md border border-border px-2 py-1 text-xs text-foreground disabled:opacity-50"
            >
              Next <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
