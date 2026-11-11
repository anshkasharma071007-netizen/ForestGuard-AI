import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import Layout from './components/Layout'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Overview from './pages/Overview'
import LiveMonitoring from './pages/LiveMonitoring'
import GISMapPage from './pages/GISMap'
import Wildlife from './pages/Wildlife'
import RiskAlerts from './pages/RiskAlerts'
import GuardPanel from './pages/GuardPanel'
import Analytics from './pages/Analytics'
import CommunityPortal from './pages/CommunityPortal'

function ProtectedLayout() {
  const { token, bootstrapping } = useAuth()
  const location = useLocation()

  if (bootstrapping) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-forest-950 bg-topo">
        <div className="flex flex-col items-center gap-3 text-forest-100">
          <Loader2 className="h-6 w-6 animate-spin text-lime" />
          <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-forest-200/70">
            Establishing secure session
          </div>
        </div>
      </div>
    )
  }

  if (!token) return <Navigate to="/login" state={{ from: location }} replace />

  return (
    <Layout>
      <Outlet />
    </Layout>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/community" element={<CommunityPortal />} />
      <Route element={<ProtectedLayout />}>
        <Route index element={<Overview />} />
        <Route path="/monitoring" element={<LiveMonitoring />} />
        <Route path="/map" element={<GISMapPage />} />
        <Route path="/wildlife" element={<Wildlife />} />
        <Route path="/risk" element={<RiskAlerts />} />
        <Route path="/guard" element={<GuardPanel />} />
        <Route path="/analytics" element={<Analytics />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
