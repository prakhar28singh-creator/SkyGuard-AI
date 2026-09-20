import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";

// Route-level code splitting: each page loads on demand, keeping the initial
// bundle small (three.js, leaflet and recharts ship only with the pages that use them).
const Landing = lazy(() => import("@/pages/Landing").then((m) => ({ default: m.Landing })));
const Login = lazy(() => import("@/pages/Login").then((m) => ({ default: m.Login })));
const Overview = lazy(() => import("@/pages/Overview").then((m) => ({ default: m.Overview })));
const Network = lazy(() => import("@/pages/Network").then((m) => ({ default: m.Network })));
const Anomalies = lazy(() => import("@/pages/Anomalies").then((m) => ({ default: m.Anomalies })));
const AnomalyDetail = lazy(() => import("@/pages/AnomalyDetail").then((m) => ({ default: m.AnomalyDetail })));
const Stations = lazy(() => import("@/pages/Stations").then((m) => ({ default: m.Stations })));
const StationDetail = lazy(() => import("@/pages/StationDetail").then((m) => ({ default: m.StationDetail })));
const Analytics = lazy(() => import("@/pages/Analytics").then((m) => ({ default: m.Analytics })));
const Maintenance = lazy(() => import("@/pages/Maintenance").then((m) => ({ default: m.Maintenance })));
const Docs = lazy(() => import("@/pages/Docs").then((m) => ({ default: m.Docs })));
const Settings = lazy(() => import("@/pages/Settings").then((m) => ({ default: m.Settings })));
const Alerts = lazy(() => import("@/pages/Alerts").then((m) => ({ default: m.Alerts })));
const Reports = lazy(() => import("@/pages/Reports").then((m) => ({ default: m.Reports })));
const Complaints = lazy(() => import("@/pages/Complaints").then((m) => ({ default: m.Complaints })));
const EdgeNodes = lazy(() => import("@/pages/EdgeNodes").then((m) => ({ default: m.EdgeNodes })));
const AboutSystem = lazy(() => import("@/pages/AboutSystem").then((m) => ({ default: m.AboutSystem })));

function PageFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-sky-blue" />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route element={<AppShell />}>
            <Route path="/overview" element={<Overview />} />
            <Route path="/network" element={<Network />} />
            <Route path="/anomalies" element={<Anomalies />} />
            <Route path="/anomalies/:id" element={<AnomalyDetail />} />
            <Route path="/stations" element={<Stations />} />
            <Route path="/stations/:id" element={<StationDetail />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/maintenance" element={<Maintenance />} />
            <Route path="/edge-nodes" element={<EdgeNodes />} />
            <Route path="/docs" element={<Docs />} />
            <Route path="/complaints" element={<Complaints />} />
            <Route path="/about" element={<AboutSystem />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
