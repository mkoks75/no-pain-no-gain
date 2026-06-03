import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './store/auth'
import ProtectedRoute from './components/ProtectedRoute'
import NavBar from './components/NavBar'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import WeekPlanner from './pages/WeekPlanner'
import WorkoutSession from './pages/WorkoutSession'
import Progress from './pages/Progress'
import ExerciseLibrary from './pages/ExerciseLibrary'
import AdminUsers from './pages/AdminUsers'

function Layout({ children }) {
  return (
    <>
      <NavBar />
      <main className="main-content">{children}</main>
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route path="/" element={
            <ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>
          } />
          <Route path="/plan/:weekStart" element={
            <ProtectedRoute><Layout><WeekPlanner /></Layout></ProtectedRoute>
          } />
          <Route path="/workout/:dayPlanId" element={
            <ProtectedRoute><WorkoutSession /></ProtectedRoute>
          } />
          <Route path="/progress" element={
            <ProtectedRoute><Layout><Progress /></Layout></ProtectedRoute>
          } />
          <Route path="/exercises" element={
            <ProtectedRoute><Layout><ExerciseLibrary /></Layout></ProtectedRoute>
          } />
          <Route path="/admin" element={
            <ProtectedRoute adminOnly><Layout><AdminUsers /></Layout></ProtectedRoute>
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
