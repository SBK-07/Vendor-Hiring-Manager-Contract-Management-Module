"use client";

export default function HiringManagerOpeningsError({ error, reset }) {
  return (
    <div className="min-h-screen p-6 bg-background">
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        <h2 className="text-base font-semibold">Failed to load hiring manager view</h2>
        <p className="mt-1 text-sm">{error?.message || "Unexpected error"}</p>
        <button
          type="button"
          className="mt-3 rounded-md border border-red-300 px-3 py-1 text-sm"
          onClick={reset}
        >
          Retry
        </button>
      </div>
    </div>
  );
}
