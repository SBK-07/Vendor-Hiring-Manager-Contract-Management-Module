// ===== Local AUTH =====
export {
  register,
  verifyLogin,
  verifyTOTP,
  refreshAccessToken,
} from "./auth/local/localAuthController.js";

// ===== Unified AUTH Logout =====
export { logout } from "./auth/logout(unified)/logout.js";

// ===== User details retrieval =====
export { getUserDetails } from "./auth/user/getUserDetails.js";

// ===== AUTH DEBUG (temporary) =====
export { getTokenDebugInfo } from "./auth/debug/getTokenDebugInfo.js";

// ===== STORAGE =====
export { listOfObjects } from "./storage/storageController.js";

// ===== FORM =====
export { createDigitalInitiative } from "./form/initiativeRequestController.js";

// ===== VENDOR MANAGEMENT =====
// Vendor resource requests
export {
  fetchRequestData,
  //   updateVendorRequest,
  //   generatePresignedUrls,
  //   uploadAttachment,
  //   // deleteAttachment,
} from "./vendor/resourceRequest/vendorRequestController.js";

// ===== HIRING MANAGEMENT =====
export {
  getProfileResumeUrl,
  getHiringManagerOpenings,
  getOpeningProfilesForHiringManager,
  shortlistProfile,
  rejectProfile,
  retryProfileRecommendation,
} from "./hiring/hiringManagerController.js";
