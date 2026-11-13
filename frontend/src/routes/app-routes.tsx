/** Declares every client-side URL and the fallback redirect for unknown paths. */
import { Navigate, Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";
import AccountRecoveryPage from "../pages/account-recovery-page";
import ArtistProfilePage from "../pages/artist-profile-page";
import BookingPage from "../pages/booking-page";
import CustomerBookingsPage from "../pages/customer-bookings-page";
import DiscoverPage from "../pages/discover-page";
import ForTechsPage from "../pages/for-techs-page";
import HomePage from "../pages/home-page";
import HowItWorksPage from "../pages/how-it-works-page";
import MessagesPage from "../pages/messages-page";
import SchedulePage from "../pages/schedule-page";
import TechProfilePage from "../pages/tech-profile-page";
import PricingPage from "@/pages/pricing/pricing-page";
import InformationPage from "../pages/information/information-page";
import { informationPages } from "../pages/information/information-data";

const RecoveryPreview = import.meta.env.DEV
  ? lazy(() => import("../pages/account-recovery-preview-page"))
  : null;

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/discover" element={<DiscoverPage />} />
      <Route path="/artists/:id" element={<ArtistProfilePage />} />
      <Route path="/artists/:id/book" element={<BookingPage />} />
      <Route path="/bookings" element={<CustomerBookingsPage />} />
      <Route path="/for-techs" element={<ForTechsPage />} />
      <Route path="/how-it-works" element={<HowItWorksPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      {informationPages.map((page) => <Route key={page.path} path={page.path} element={<InformationPage page={page} />} />)}
      <Route path="/messages" element={<MessagesPage />} />
      <Route path="/forgot-password" element={<AccountRecoveryPage flow="forgot" />} />
      <Route path="/reset-password" element={<AccountRecoveryPage flow="reset" />} />
      <Route path="/verify-email" element={<AccountRecoveryPage flow="verify" />} />
      {RecoveryPreview ? <Route path="/dev/account-recovery" element={<Suspense fallback={<p role="status">Loading preview…</p>}><RecoveryPreview /></Suspense>} /> : null}
      <Route path="/schedule" element={<SchedulePage />} />
      <Route path="/tech-profile" element={<TechProfilePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
