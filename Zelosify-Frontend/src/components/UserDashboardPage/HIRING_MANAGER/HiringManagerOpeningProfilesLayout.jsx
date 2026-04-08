"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import axiosInstance from "@/utils/Axios/AxiosInstance";

const STATUS_META = {
  SUBMITTED: { label: "Queued", color: "text-gray-700 bg-gray-100 border-gray-300" },
  PROCESSING: { label: "Analyzing...", color: "text-blue-700 bg-blue-50 border-blue-200" },
  COMPLETED: { label: "Complete", color: "text-green-700 bg-green-50 border-green-200" },
  FAILED: { label: "Failed", color: "text-red-700 bg-red-50 border-red-200" },
  REVIEW_NEEDED: {
    label: "Review Needed",
    color: "text-yellow-800 bg-yellow-50 border-yellow-300",
  },
};

const FILTERS = ["ALL", "SHORTLISTED", "REJECTED", "PENDING", "REVIEW_NEEDED", "FAILED"];
const SORT_OPTIONS = [
  { value: "SCORE_DESC", label: "Highest Score" },
  { value: "LATEST_UPLOAD", label: "Latest Upload" },
  { value: "CONFIDENCE_DESC", label: "Highest Confidence" },
  { value: "LATENCY_ASC", label: "Lowest Latency" },
];

function asPercent(value) {
  const numeric = Number(value || 0);
  return `${(numeric * 100).toFixed(1)}%`;
}

function hasPendingStatus(status) {
  return status === "SUBMITTED" || status === "PROCESSING";
}

function ProgressRow({ label, value }) {
  const safe = Math.max(0, Math.min(1, Number(value || 0)));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] text-secondary">
        <span>{label}</span>
        <span>{(safe * 100).toFixed(0)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div className="h-full rounded-full bg-blue-500" style={{ width: `${safe * 100}%` }} />
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-md border border-border p-4 animate-pulse">
      <div className="h-4 w-48 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="mt-2 h-3 w-72 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="mt-4 h-3 w-56 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="mt-2 h-3 w-52 rounded bg-gray-200 dark:bg-gray-700" />
    </div>
  );
}

export default function HiringManagerOpeningProfilesLayout({ openingId }) {
  const [opening, setOpening] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [decisionLoadingId, setDecisionLoadingId] = useState(null);
  const [retryLoadingId, setRetryLoadingId] = useState(null);
  const [pollingLive, setPollingLive] = useState(false);
  const [activeFilter, setActiveFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("SCORE_DESC");
  const [resumeModal, setResumeModal] = useState({ open: false, url: "", profileName: "" });

  const fetchProfiles = async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }

    try {
      const response = await axiosInstance.get(`/hiring-manager/openings/${openingId}/profiles`);
      setOpening(response?.data?.data?.opening || null);
      setProfiles(response?.data?.data?.profiles || []);
      setError("");
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Failed to fetch profiles");
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchProfiles(true);
  }, [openingId]);

  const hasPending = useMemo(
    () => profiles.some((profile) => hasPendingStatus(profile.status)),
    [profiles]
  );

  useEffect(() => {
    if (!hasPending) {
      setPollingLive(false);
      return undefined;
    }

    // NEW: real-time status polling while async analysis is running
    setPollingLive(true);
    const interval = setInterval(async () => {
      await fetchProfiles(false);
    }, 3000);

    return () => {
      clearInterval(interval);
      setPollingLive(false);
    };
  }, [hasPending, openingId]);

  const onShortlist = async (profileId) => {
    setDecisionLoadingId(profileId);
    setError("");

    try {
      await axiosInstance.post(`/hiring-manager/profiles/${profileId}/shortlist`);
      toast.success("Candidate moved to shortlist");
      await fetchProfiles(false);
    } catch (apiError) {
      const message = apiError?.response?.data?.message || "Failed to shortlist profile";
      setError(message);
      toast.error(message);
    } finally {
      setDecisionLoadingId(null);
    }
  };

  const onReject = async (profileId) => {
    setDecisionLoadingId(profileId);
    setError("");

    try {
      await axiosInstance.post(`/hiring-manager/profiles/${profileId}/reject`);
      toast.success("Candidate rejected");
      await fetchProfiles(false);
    } catch (apiError) {
      const message = apiError?.response?.data?.message || "Failed to reject profile";
      setError(message);
      toast.error(message);
    } finally {
      setDecisionLoadingId(null);
    }
  };

  const onRetry = async (profileId, candidateName) => {
    setRetryLoadingId(profileId);
    setError("");

    try {
      await axiosInstance.post(`/hiring-manager/profiles/${profileId}/retry`);
      toast.success(`Re-analysis started for ${candidateName}`);
      await fetchProfiles(false);
    } catch (apiError) {
      const message = apiError?.response?.data?.error || "Failed to queue retry";
      setError(message);
      toast.error(message);
    } finally {
      setRetryLoadingId(null);
    }
  };

  const onViewResume = async (profile) => {
    try {
      const response = await axiosInstance.get(`/hiring-manager/profiles/${profile.id}/resume-url`);
      const resumeUrl = response?.data?.data?.resumeUrl;
      if (!resumeUrl) {
        throw new Error("Resume URL missing");
      }
      setResumeModal({
        open: true,
        url: resumeUrl,
        profileName: profile.s3Key.split("/").pop(),
      });
    } catch (apiError) {
      const message = apiError?.response?.data?.error || apiError.message || "Failed to load resume";
      setError(message);
      toast.error(message);
    }
  };

  const filteredProfiles = useMemo(() => {
    const byFilter = profiles.filter((profile) => {
      if (activeFilter === "ALL") return true;
      if (activeFilter === "SHORTLISTED") return profile.recommended === true;
      if (activeFilter === "REJECTED") return profile.recommended === false && profile.status === "COMPLETED";
      if (activeFilter === "PENDING") return hasPendingStatus(profile.status);
      if (activeFilter === "REVIEW_NEEDED") return profile.status === "REVIEW_NEEDED";
      if (activeFilter === "FAILED") return profile.status === "FAILED";
      return true;
    });

    const cloned = [...byFilter];
    cloned.sort((a, b) => {
      if (sortBy === "LATEST_UPLOAD") {
        return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
      }
      if (sortBy === "CONFIDENCE_DESC") {
        return Number(b.recommendationConfidence || 0) - Number(a.recommendationConfidence || 0);
      }
      if (sortBy === "LATENCY_ASC") {
        return Number(a.recommendationLatencyMs || Number.MAX_SAFE_INTEGER) - Number(b.recommendationLatencyMs || Number.MAX_SAFE_INTEGER);
      }
      return Number(b.recommendationScore || 0) - Number(a.recommendationScore || 0);
    });

    return cloned;
  }, [profiles, activeFilter, sortBy]);

  const stats = useMemo(() => {
    const completed = profiles.filter((p) => p.status === "COMPLETED");
    const pending = profiles.filter((p) => hasPendingStatus(p.status));
    const failed = profiles.filter((p) => p.status === "FAILED");
    const review = profiles.filter((p) => p.status === "REVIEW_NEEDED");
    const shortlisted = completed.filter((p) => p.recommended === true);
    const rejected = completed.filter((p) => p.recommended === false);

    const avgScore =
      completed.length > 0
        ? completed.reduce((sum, p) => sum + Number(p.recommendationScore || 0), 0) / completed.length
        : 0;

    const latencyEntries = completed.filter((p) => Number.isFinite(Number(p.recommendationLatencyMs)));
    const avgLatency =
      latencyEntries.length > 0
        ? Math.round(
            latencyEntries.reduce((sum, p) => sum + Number(p.recommendationLatencyMs || 0), 0) /
              latencyEntries.length
          )
        : 0;

    return {
      total: profiles.length,
      shortlisted: shortlisted.length,
      rejected: rejected.length,
      pending: pending.length,
      failed: failed.length,
      review: review.length,
      avgScore,
      avgLatency,
    };
  }, [profiles]);

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <Link
          href="/hiring-manager/openings"
          className="inline-flex items-center text-sm text-foreground hover:underline"
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to Openings
        </Link>

        {pollingLive && (
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs text-blue-700">
            <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" /> Live
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="mb-4 rounded-lg border border-border bg-white p-4 dark:bg-[#111827]">
        <h1 className="text-xl font-semibold text-foreground">{opening?.title || "Opening Profiles"}</h1>
        <p className="mt-1 text-xs text-secondary">
          {opening?.location || "-"} • {opening?.contractType || "-"} • {opening?.status || "-"}
        </p>
      </section>

      <section className="mb-4 rounded-lg border border-border bg-white p-4 dark:bg-[#111827]">
        <p className="text-sm text-foreground">Total profiles: {stats.total}</p>
        <p className="mt-1 text-xs text-secondary">
          Shortlisted: {stats.shortlisted} | Rejected: {stats.rejected} | Pending: {stats.pending} |
          Failed: {stats.failed} | Review Needed: {stats.review}
        </p>
        <p className="mt-1 text-xs text-secondary">
          Average score: {(stats.avgScore * 100).toFixed(1)}% | Average latency: {stats.avgLatency} ms
        </p>
      </section>

      <section className="rounded-lg border border-border bg-white p-4 dark:bg-[#111827]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-foreground">Submitted Profiles</h2>

          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setActiveFilter(filter)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  activeFilter === filter
                    ? "border-blue-400 bg-blue-50 text-blue-700"
                    : "border-border text-secondary"
                }`}
              >
                {filter.replaceAll("_", " ")}
              </button>
            ))}

            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
              className="rounded-md border border-border px-2 py-1 text-xs"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <SkeletonCard key={index} />
            ))}
          </div>
        )}

        {!loading && filteredProfiles.length === 0 && (
          <p className="text-sm text-secondary">No profiles available for the selected filter.</p>
        )}

        {!loading && filteredProfiles.length > 0 && (
          <div className="space-y-3">
            {filteredProfiles.map((profile) => {
              const status = profile.status;
              const statusMeta = STATUS_META[status] || STATUS_META.SUBMITTED;
              const isPending = hasPendingStatus(status);
              const isComplete = status === "COMPLETED";
              const isReviewNeeded = status === "REVIEW_NEEDED";
              const isFailed = status === "FAILED";

              return (
                <article key={profile.id} className="rounded-md border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{profile.s3Key.split("/").pop()}</p>
                    <span className={`rounded-full border px-2 py-1 text-[11px] transition-colors ${statusMeta.color}`}>
                      {statusMeta.label}
                    </span>
                  </div>

                  <p className="mt-1 text-xs text-secondary">
                    Uploaded: {new Date(profile.submittedAt).toLocaleString()}
                  </p>

                  {isPending && (
                    <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                      Analysis in progress. Score, confidence, and recommendation will appear after completion.
                    </div>
                  )}

                  {isFailed && (
                    <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      Analysis failed. {profile.errorMessage || "Please retry."}
                    </div>
                  )}

                  {isReviewNeeded && (
                    <div className="mt-3 rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
                      ⚠ Review Needed — AI gave conflicting signals. Please retry or review manually.
                    </div>
                  )}

                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
                    <div>
                      <p className="text-[11px] text-secondary">Score</p>
                      <p className="text-sm text-foreground">
                        {isComplete ? asPercent(profile.recommendationScore) : "--"}
                      </p>
                      {isComplete && (
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                          <div
                            className="h-full rounded-full bg-green-500"
                            style={{ width: `${Math.max(0, Math.min(100, Number(profile.recommendationScore || 0) * 100))}%` }}
                          />
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="text-[11px] text-secondary">Confidence</p>
                      <p className="text-sm text-foreground">
                        {isComplete ? asPercent(profile.recommendationConfidence) : "--"}
                      </p>
                    </div>

                    <div>
                      <p className="text-[11px] text-secondary">Recommendation</p>
                      <p className="text-sm text-foreground">
                        {isComplete ? (profile.recommended ? "Shortlist" : "Reject") : "--"}
                      </p>
                    </div>

                    <div>
                      <p className="text-[11px] text-secondary">Latency</p>
                      <p className="text-sm text-foreground">
                        {isComplete ? `${profile.recommendationLatencyMs ?? 0} ms` : "--"}
                      </p>
                    </div>
                  </div>

                  <p className="mt-3 text-xs text-secondary">
                    {isComplete || isReviewNeeded
                      ? profile.recommendationReason || "No reason provided"
                      : "Recommendation pending"}
                  </p>

                  {isComplete && (
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="rounded-md border border-border p-3">
                        <p className="mb-2 text-xs font-medium text-foreground">Score Breakdown</p>
                        <div className="space-y-2">
                          <ProgressRow
                            label="Skills Match"
                            value={profile.recommendationBreakdown?.skillsMatch}
                          />
                          <ProgressRow
                            label="Experience Match"
                            value={profile.recommendationBreakdown?.experienceMatch}
                          />
                          <ProgressRow
                            label="Education Match"
                            value={profile.recommendationBreakdown?.educationMatch}
                          />
                        </div>
                      </div>

                      <div className="rounded-md border border-border p-3">
                        <p className="mb-2 text-xs font-medium text-foreground">Skill Highlights</p>
                        <div className="mb-2 flex flex-wrap gap-1">
                          {(profile.matchedSkills || []).map((skill) => (
                            <span
                              key={`match-${profile.id}-${skill}`}
                              title="Found in resume"
                              className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] text-green-700"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {(profile.missingSkills || []).map((skill) => (
                            <span
                              key={`missing-${profile.id}-${skill}`}
                              className="rounded-full border border-gray-300 px-2 py-0.5 text-[11px] text-gray-600"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {isComplete && (
                    <p className="mt-2 text-[11px] text-secondary">
                      Processed in {profile.processingTimeMs ?? profile.recommendationLatencyMs ?? 0} ms
                      {Number(profile.retryCount || 0) > 0 ? ` • Retry #${profile.retryCount}` : ""}
                      {profile.tokenUsage?.totalTokens ? ` • ~${profile.tokenUsage.totalTokens} tokens used` : ""}
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onViewResume(profile)}
                      className="rounded-md border border-border px-2 py-1 text-xs text-foreground"
                    >
                      View Resume
                    </button>

                    <button
                      type="button"
                      onClick={() => onShortlist(profile.id)}
                      disabled={decisionLoadingId === profile.id || status === "PROCESSING"}
                      className="rounded-md border border-green-200 px-2 py-1 text-xs text-green-700 disabled:opacity-60"
                    >
                      {decisionLoadingId === profile.id ? "Working..." : "Shortlist"}
                    </button>

                    <button
                      type="button"
                      onClick={() => onReject(profile.id)}
                      disabled={decisionLoadingId === profile.id || status === "PROCESSING"}
                      className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 disabled:opacity-60"
                    >
                      Reject
                    </button>

                    {(status === "FAILED" || status === "REVIEW_NEEDED" || status === "COMPLETED") && (
                      <button
                        type="button"
                        onClick={() => onRetry(profile.id, profile.s3Key.split("/").pop() || "candidate")}
                        disabled={retryLoadingId === profile.id || status === "PROCESSING"}
                        className="inline-flex items-center rounded-md border border-blue-200 px-2 py-1 text-xs text-blue-700 disabled:opacity-60"
                      >
                        {retryLoadingId === profile.id ? (
                          <>
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Queueing
                          </>
                        ) : (
                          <>
                            <RefreshCw className="mr-1 h-3 w-3" />
                            {status === "COMPLETED" ? "Re-analyze" : "Retry"}
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {resumeModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="h-[80vh] w-full max-w-5xl rounded-lg bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">{resumeModal.profileName}</p>
              <button
                type="button"
                className="rounded-md border border-border px-2 py-1 text-xs"
                onClick={() => setResumeModal({ open: false, url: "", profileName: "" })}
              >
                Close
              </button>
            </div>
            <iframe title="Resume Preview" src={resumeModal.url} className="h-[calc(80vh-52px)] w-full rounded border" />
          </div>
        </div>
      )}
    </div>
  );
}
