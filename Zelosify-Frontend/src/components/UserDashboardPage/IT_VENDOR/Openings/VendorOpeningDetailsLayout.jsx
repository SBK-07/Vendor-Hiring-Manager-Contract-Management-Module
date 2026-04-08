"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Loader2, Trash2, Upload } from "lucide-react";
import axiosInstance from "@/utils/Axios/AxiosInstance";

const ACCEPTED_FILE_TYPES = [".pdf", ".pptx"];

async function sha256Hex(file) {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const bytes = Array.from(new Uint8Array(hashBuffer));
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default function VendorOpeningDetailsLayout({ openingId }) {
  const [opening, setOpening] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [deleteLoadingId, setDeleteLoadingId] = useState(null);
  const [previewLoadingId, setPreviewLoadingId] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [error, setError] = useState("");
  const [selectedFiles, setSelectedFiles] = useState([]);

  const fileInputRef = useRef(null);

  const selectedOpeningStatus = opening?.status || "";

  const canUpload = useMemo(
    () => selectedOpeningStatus === "OPEN" && !submitLoading,
    [selectedOpeningStatus, submitLoading]
  );

  const fetchOpeningDetails = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await axiosInstance.get(`/vendor/openings/${openingId}`);
      setOpening(response?.data?.data || null);
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Failed to load opening details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOpeningDetails();
  }, [openingId]);

  const isAllowedFileName = (name) => {
    const lower = name.toLowerCase();
    return lower.endsWith(".pdf") || lower.endsWith(".pptx");
  };

  const uploadSelectedFiles = async (files) => {
    if (!files.length || !openingId) {
      return;
    }

    if (files.length > 10) {
      setError("Maximum 10 files are allowed per upload");
      return;
    }

    const invalid = files.find((file) => !isAllowedFileName(file.name));
    if (invalid) {
      setError("Only PDF and PPTX files are allowed");
      return;
    }

    // NEW: duplicate upload prevention using SHA-256 file hash
    for (const file of files) {
      const fileHash = await sha256Hex(file);
      const duplicateResponse = await axiosInstance.post(`/vendor/openings/${openingId}/check-duplicate`, {
        fileHash,
      });

      if (duplicateResponse?.data?.data?.isDuplicate) {
        const submittedAt = duplicateResponse?.data?.data?.existingSubmittedAt;
        const duplicateWarning = `A resume with this content was already uploaded on ${new Date(
          submittedAt
        ).toLocaleString()}. Upload anyway?`;

        if (!window.confirm(duplicateWarning)) {
          return;
        }
      }
    }

    setError("");
    setSelectedFiles(files);
    setSubmitLoading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("profiles", file));

      await axiosInstance.post(`/vendor/openings/${openingId}/profiles/upload`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        onUploadProgress: (progressEvent) => {
          const total = progressEvent.total || 0;
          if (!total) {
            return;
          }
          const percent = Math.round((progressEvent.loaded * 100) / total);
          setUploadProgress(percent);
        },
      });

      setSelectedFiles([]);
      await fetchOpeningDetails();
    } catch (apiError) {
      setSelectedFiles([]);
      setError(apiError?.response?.data?.message || apiError.message || "Upload failed");
    } finally {
      setSubmitLoading(false);
      setUploadProgress(0);
    }
  };

  const handleFileSelect = async (event) => {
    const files = Array.from(event.target.files || []);
    await uploadSelectedFiles(files);
  };

  const handleDrop = async (event) => {
    event.preventDefault();
    if (!canUpload) {
      return;
    }

    const files = Array.from(event.dataTransfer.files || []);
    await uploadSelectedFiles(files);
  };

  const handleSoftDelete = async (profileId) => {
    setError("");
    setDeleteLoadingId(profileId);

    try {
      await axiosInstance.patch(`/vendor/openings/profiles/${profileId}/soft-delete`);
      await fetchOpeningDetails();
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Failed to soft delete profile");
    } finally {
      setDeleteLoadingId(null);
    }
  };

  const handlePreview = async (profileId) => {
    setError("");
    setPreviewLoadingId(profileId);

    try {
      const response = await axiosInstance.get(`/vendor/openings/${openingId}/profiles/${profileId}/view`);
      const previewUrl = response?.data?.data?.previewUrl;
      if (!previewUrl) {
        throw new Error("Preview URL not found");
      }
      window.open(previewUrl, "_blank", "noopener,noreferrer");
    } catch (apiError) {
      setError(apiError?.response?.data?.message || apiError.message || "Failed to preview file");
    } finally {
      setPreviewLoadingId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <Loader2 className="h-5 w-5 animate-spin text-secondary" />
      </div>
    );
  }

  if (!opening) {
    return (
      <div className="min-h-screen bg-background p-6">
        <p className="text-sm text-red-600">Opening not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="mb-4">
        <Link
          href="/vendor/openings"
          className="inline-flex items-center text-sm text-foreground hover:underline"
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to Openings
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="mb-4 rounded-lg border border-border bg-white p-4 dark:bg-[#111827]">
        <h1 className="text-xl font-semibold text-foreground">{opening.title}</h1>
        <p className="mt-2 text-sm text-secondary">{opening.description || "No description"}</p>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <Info label="Location" value={opening.location || "-"} />
          <Info label="Contract Type" value={opening.contractType || "-"} />
          <Info label="Posted Date" value={new Date(opening.postedDate).toLocaleDateString()} />
          <Info label="Hiring Manager Name" value={opening.hiringManagerName} />
          <Info label="Experience Range" value={opening.experienceRange} />
          <Info label="Profiles Count" value={String(opening.profilesCount)} />
        </div>
      </section>

      <section className="mb-4 rounded-lg border border-border bg-white p-4 dark:bg-[#111827]">
        <h2 className="mb-3 text-base font-semibold text-foreground">Upload Profiles</h2>

        {selectedOpeningStatus !== "OPEN" && (
          <p className="mb-3 rounded-md bg-yellow-50 px-3 py-2 text-xs text-yellow-700">
            This opening is not open. Upload and submit is disabled.
          </p>
        )}

        <div
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
          className="rounded-md border border-dashed border-border p-4"
        >
          <p className="text-sm text-foreground">Drag and drop PDF/PPTX files here</p>
          <p className="mt-1 text-xs text-secondary">or use the picker below</p>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!canUpload}
            className="mt-3 inline-flex items-center rounded-md border border-border px-3 py-2 text-xs text-foreground disabled:opacity-60"
          >
            <Upload className="mr-2 h-3 w-3" /> Choose Files
          </button>

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept={ACCEPTED_FILE_TYPES.join(",")}
            multiple
            onChange={handleFileSelect}
            disabled={!canUpload}
          />
        </div>

        {selectedFiles.length > 0 && (
          <p className="mt-3 text-xs text-secondary">Selected: {selectedFiles.length} file(s)</p>
        )}

        {submitLoading && (
          <p className="mt-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
            Uploading via backend: {uploadProgress}%
          </p>
        )}
      </section>

      <section className="rounded-lg border border-border bg-white p-4 dark:bg-[#111827]">
        <h2 className="mb-3 text-base font-semibold text-foreground">Uploaded Profiles</h2>

        {(opening.hiringProfiles || []).length === 0 ? (
          <p className="text-xs text-secondary">No profiles uploaded yet.</p>
        ) : (
          <div className="space-y-2">
            {opening.hiringProfiles.map((profile) => (
              <div
                key={profile.id}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2"
              >
                <div>
                  <p className="text-xs text-foreground">{profile.s3Key.split("/").pop()}</p>
                  <p className="text-[11px] text-secondary">
                    {new Date(profile.submittedAt).toLocaleString()} • {profile.status}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePreview(profile.id)}
                    disabled={previewLoadingId === profile.id}
                    className="rounded-md border border-border px-2 py-1 text-xs text-foreground disabled:opacity-60"
                  >
                    {previewLoadingId === profile.id ? "Loading..." : "Preview"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSoftDelete(profile.id)}
                    disabled={deleteLoadingId === profile.id}
                    className="inline-flex items-center rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 disabled:opacity-60"
                  >
                    {deleteLoadingId === profile.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <>
                        <Trash2 className="mr-1 h-3 w-3" /> Soft Delete
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-xs text-secondary">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}
