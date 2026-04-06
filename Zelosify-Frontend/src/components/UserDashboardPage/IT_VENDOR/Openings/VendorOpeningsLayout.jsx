"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCcw, Upload } from "lucide-react";
import axios from "axios";
import axiosInstance from "@/utils/Axios/AxiosInstance";

const initialProfileForm = {
  candidateName: "",
  candidateEmail: "",
  candidatePhone: "",
  totalExperience: "",
};

export default function VendorOpeningsLayout() {
  const [openings, setOpenings] = useState([]);
  const [selectedOpeningId, setSelectedOpeningId] = useState("");
  const [selectedOpening, setSelectedOpening] = useState(null);

  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);

  const [error, setError] = useState("");
  const [profileForm, setProfileForm] = useState(initialProfileForm);
  const [resumeFile, setResumeFile] = useState(null);

  const [uploadedMeta, setUploadedMeta] = useState({
    s3Key: "",
    fileName: "",
  });

  const selectedOpeningStatus = useMemo(() => {
    return selectedOpening?.status || "";
  }, [selectedOpening]);

  const fetchOpenings = async () => {
    setListLoading(true);
    setError("");

    try {
      const response = await axiosInstance.get("/vendor/openings");
      const data = response?.data?.data || [];
      setOpenings(data);

      if (data.length > 0 && !selectedOpeningId) {
        setSelectedOpeningId(data[0].id);
      }

      if (data.length === 0) {
        setSelectedOpeningId("");
        setSelectedOpening(null);
      }
    } catch (apiError) {
      setError(apiError?.response?.data?.message || "Failed to load openings");
    } finally {
      setListLoading(false);
    }
  };

  const fetchOpeningDetails = async (openingId) => {
    if (!openingId) {
      setSelectedOpening(null);
      return;
    }

    setDetailLoading(true);
    setError("");

    try {
      const response = await axiosInstance.get(`/vendor/openings/${openingId}`);
      setSelectedOpening(response?.data?.data || null);
    } catch (apiError) {
      setError(
        apiError?.response?.data?.message || "Failed to load opening details"
      );
      setSelectedOpening(null);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    fetchOpenings();
  }, []);

  useEffect(() => {
    fetchOpeningDetails(selectedOpeningId);
  }, [selectedOpeningId]);

  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !selectedOpeningId) {
      return;
    }

    setError("");
    setResumeFile(file);

    try {
      const presignResponse = await axiosInstance.post(
        `/vendor/openings/${selectedOpeningId}/profiles/presign`,
        {
          fileName: file.name,
        }
      );

      const uploadUrl = presignResponse?.data?.data?.uploadUrl;
      const s3Key = presignResponse?.data?.data?.s3Key;
      const safeFileName = presignResponse?.data?.data?.fileName;

      if (!uploadUrl || !s3Key || !safeFileName) {
        throw new Error("Invalid presign response from server");
      }

      await axios.put(uploadUrl, file, {
        headers: {
          "Content-Type": file.type || "application/pdf",
        },
      });

      setUploadedMeta({
        s3Key,
        fileName: safeFileName,
      });
    } catch (apiError) {
      setUploadedMeta({ s3Key: "", fileName: "" });
      setError(apiError?.response?.data?.message || apiError.message || "Upload failed");
    }
  };

  const handleSubmitProfile = async (event) => {
    event.preventDefault();

    if (!selectedOpeningId) {
      setError("Select an opening first");
      return;
    }

    if (!uploadedMeta.s3Key || !uploadedMeta.fileName) {
      setError("Upload resume first");
      return;
    }

    setSubmitLoading(true);
    setError("");

    try {
      await axiosInstance.post(`/vendor/openings/${selectedOpeningId}/profiles/upload`, {
        candidateName: profileForm.candidateName,
        candidateEmail: profileForm.candidateEmail,
        candidatePhone: profileForm.candidatePhone,
        totalExperience: profileForm.totalExperience
          ? Number(profileForm.totalExperience)
          : undefined,
        resumeS3Key: uploadedMeta.s3Key,
        resumeFileName: uploadedMeta.fileName,
      });

      setProfileForm(initialProfileForm);
      setResumeFile(null);
      setUploadedMeta({ s3Key: "", fileName: "" });

      await Promise.all([fetchOpenings(), fetchOpeningDetails(selectedOpeningId)]);
    } catch (apiError) {
      setError(
        apiError?.response?.data?.message || "Failed to submit candidate profile"
      );
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">IT Vendor Openings</h1>
        <button
          type="button"
          onClick={fetchOpenings}
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

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <section className="xl:col-span-1 rounded-lg border border-border bg-white p-4 dark:bg-[#111827]">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Openings</h2>
            {listLoading && <Loader2 className="h-4 w-4 animate-spin text-secondary" />}
          </div>

          <div className="space-y-2">
            {!listLoading && openings.length === 0 && (
              <p className="text-sm text-secondary">No openings found for your tenant.</p>
            )}

            {openings.map((opening) => (
              <button
                key={opening.id}
                type="button"
                onClick={() => setSelectedOpeningId(opening.id)}
                className={`w-full rounded-md border px-3 py-3 text-left transition ${
                  selectedOpeningId === opening.id
                    ? "border-foreground bg-tableHeader"
                    : "border-border hover:bg-tableHeader"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{opening.code}</p>
                    <p className="text-sm text-foreground">{opening.title}</p>
                    <p className="text-xs text-secondary">
                      {opening.department} {opening.location ? `• ${opening.location}` : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] text-blue-700 dark:bg-blue-900 dark:text-blue-200">
                    {opening.status}
                  </span>
                </div>
                <p className="mt-2 text-xs text-secondary">
                  Submitted Profiles: {opening.profilesSubmittedCount}
                </p>
              </button>
            ))}
          </div>
        </section>

        <section className="xl:col-span-2 rounded-lg border border-border bg-white p-4 dark:bg-[#111827]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Opening Details</h2>
            {detailLoading && (
              <Loader2 className="h-4 w-4 animate-spin text-secondary" />
            )}
          </div>

          {!selectedOpening && !detailLoading && (
            <p className="text-sm text-secondary">Choose an opening to view details.</p>
          )}

          {selectedOpening && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Info label="Opening" value={`${selectedOpening.code} - ${selectedOpening.title}`} />
                <Info label="Department" value={selectedOpening.department} />
                <Info label="Location" value={selectedOpening.location || "Not specified"} />
                <Info
                  label="Experience"
                  value={`${selectedOpening.experienceMinYears} - ${selectedOpening.experienceMaxYears} years`}
                />
                <Info
                  label="Positions"
                  value={String(selectedOpening.numberOfPositions)}
                />
                <Info
                  label="Submitted"
                  value={String(selectedOpening.profilesSubmittedCount)}
                />
              </div>

              <div>
                <p className="mb-1 text-xs text-secondary">Description</p>
                <p className="rounded-md border border-border bg-tableHeader px-3 py-2 text-sm text-foreground">
                  {selectedOpening.description || "No description available"}
                </p>
              </div>

              <div>
                <p className="mb-1 text-xs text-secondary">Required Skills</p>
                <div className="flex flex-wrap gap-2">
                  {(selectedOpening.requiredSkills || []).map((skill) => (
                    <span
                      key={skill}
                      className="rounded-full border border-border bg-tableHeader px-2 py-1 text-xs text-foreground"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              <form onSubmit={handleSubmitProfile} className="space-y-3 rounded-md border border-border p-3">
                <h3 className="text-sm font-semibold text-foreground">Submit Candidate Profile</h3>

                {selectedOpeningStatus !== "OPEN" && (
                  <p className="rounded-md bg-yellow-50 px-3 py-2 text-xs text-yellow-700">
                    This opening is not open. Upload and submit is disabled.
                  </p>
                )}

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Input
                    label="Candidate Name"
                    value={profileForm.candidateName}
                    onChange={(value) =>
                      setProfileForm((prev) => ({ ...prev, candidateName: value }))
                    }
                    required
                    disabled={selectedOpeningStatus !== "OPEN" || submitLoading}
                  />
                  <Input
                    label="Candidate Email"
                    type="email"
                    value={profileForm.candidateEmail}
                    onChange={(value) =>
                      setProfileForm((prev) => ({ ...prev, candidateEmail: value }))
                    }
                    required
                    disabled={selectedOpeningStatus !== "OPEN" || submitLoading}
                  />
                  <Input
                    label="Candidate Phone"
                    value={profileForm.candidatePhone}
                    onChange={(value) =>
                      setProfileForm((prev) => ({ ...prev, candidatePhone: value }))
                    }
                    disabled={selectedOpeningStatus !== "OPEN" || submitLoading}
                  />
                  <Input
                    label="Total Experience (years)"
                    type="number"
                    value={profileForm.totalExperience}
                    onChange={(value) =>
                      setProfileForm((prev) => ({ ...prev, totalExperience: value }))
                    }
                    disabled={selectedOpeningStatus !== "OPEN" || submitLoading}
                  />
                </div>

                <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm text-foreground hover:bg-tableHeader">
                  <Upload className="h-4 w-4" />
                  <span>{resumeFile ? resumeFile.name : "Upload resume (PDF preferred)"}</span>
                  <input
                    type="file"
                    className="hidden"
                    onChange={handleFileSelect}
                    disabled={selectedOpeningStatus !== "OPEN" || submitLoading}
                  />
                </label>

                {uploadedMeta.fileName && (
                  <p className="text-xs text-green-700">Uploaded: {uploadedMeta.fileName}</p>
                )}

                <button
                  type="submit"
                  disabled={selectedOpeningStatus !== "OPEN" || submitLoading}
                  className="inline-flex items-center rounded-md bg-foreground px-4 py-2 text-sm text-background disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    "Submit Profile"
                  )}
                </button>
              </form>
            </div>
          )}
        </section>
      </div>
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

function Input({ label, value, onChange, required, type = "text", disabled }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-secondary">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        disabled={disabled}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:bg-tableHeader"
      />
    </label>
  );
}
