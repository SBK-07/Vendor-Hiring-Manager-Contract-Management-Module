"use client";

import dynamic from "next/dynamic";

const LoginPage = dynamic(() => import("@/pages/LandingPage/auth/LoginPage"), {
  ssr: false,
});

export default function LoginClientOnly() {
  return <LoginPage />;
}
