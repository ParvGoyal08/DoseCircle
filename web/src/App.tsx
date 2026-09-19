import { createBrowserRouter, Navigate, Outlet, RouterProvider } from "react-router";
import { ErrorToaster } from "./components/ErrorToaster";
import { FamilyProvider } from "./lib/family";
import { DemoPage } from "./routes/demo/DemoPage";
import { DemoPrescriptionPage } from "./routes/demo/DemoPrescriptionPage";
import { InviteAcceptPage, OnboardingPage, SignInPage } from "./routes/family/AuthPages";
import { ChecksPage } from "./routes/family/ChecksPage";
import { AlertPage, HomePage } from "./routes/family/HomePage";
import { InsightsPage } from "./routes/family/InsightsPage";
import { MedicinesPage } from "./routes/family/MedicinesPage";
import { PeoplePage } from "./routes/family/PeoplePage";
import { PrescriptionPage } from "./routes/family/PrescriptionPage";
import { ReportPage } from "./routes/family/ReportPage";
import { MySettingsPage, ParentSettingsPage } from "./routes/family/SettingsPages";
import { AppLaunch } from "./routes/AppLaunch";
import { LandingPage } from "./routes/LandingPage";
import { JoinPage, ParentDosePage, ParentHomePage } from "./routes/parent/ParentPages";
import "./lib/auth";

const router = createBrowserRouter([
  { path: "/", element: <LandingPage /> },
  // The installed app opens here and goes to the right screen for this phone.
  { path: "/app", element: <AppLaunch /> },
  { path: "/demo", element: <DemoPage /> },
  { path: "/demo/prescription", element: <DemoPrescriptionPage /> },

  // Parent phone: no account, paired with a one-time code.
  { path: "/join", element: <JoinPage /> },
  { path: "/parent", element: <ParentHomePage /> },
  { path: "/parent/dose/:doseId", element: <ParentDosePage /> },

  // Family: Cognito sign-in.
  {
    element: (
      <FamilyProvider>
        <Outlet />
      </FamilyProvider>
    ),
    children: [
      { path: "/signin", element: <SignInPage /> },
      { path: "/onboarding", element: <OnboardingPage /> },
      { path: "/invite", element: <InviteAcceptPage /> },
      { path: "/home", element: <HomePage /> },
      { path: "/alerts/:doseId", element: <AlertPage /> },
      { path: "/parents/:pid/medicines", element: <MedicinesPage /> },
      { path: "/parents/:pid/checks", element: <ChecksPage /> },
      { path: "/people", element: <PeoplePage /> },
      { path: "/parents/:pid/prescription", element: <PrescriptionPage /> },
      { path: "/parents/:pid/insights", element: <InsightsPage /> },
      { path: "/parents/:pid/report", element: <ReportPage /> },
      { path: "/parents/:pid/settings", element: <ParentSettingsPage /> },
      { path: "/settings", element: <MySettingsPage /> },
      // Refill notifications link here.
      { path: "/medicines", element: <Navigate to="/home" replace /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);

export function App() {
  return (
    <>
      <RouterProvider router={router} />
      <ErrorToaster />
    </>
  );
}
