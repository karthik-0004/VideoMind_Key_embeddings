import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { Landing } from './pages/Landing';
import { Dashboard } from './pages/Dashboard';
import { Upload } from './pages/Upload';
import { Chat } from './pages/Chat';
import { Profile } from './pages/Profile';
import { PDFViewer } from './pages/PDFViewer';
import { History } from './pages/History';
import { StudyRoom } from './pages/StudyRoom';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public route - Landing page */}
            <Route path="/" element={<Landing />} />

            {/* Public route - Login page */}
            <Route path="/login" element={<Login />} />

            {/* All other routes are PROTECTED - require Google login */}
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="/upload" element={
              <ProtectedRoute>
                <Upload />
              </ProtectedRoute>
            } />
            <Route path="/chat/:id" element={
              <ProtectedRoute>
                <Chat />
              </ProtectedRoute>
            } />
            <Route path="/pdf/:id" element={
              <ProtectedRoute>
                <PDFViewer />
              </ProtectedRoute>
            } />
            <Route path="/study-room/:id" element={
              <ProtectedRoute>
                <StudyRoom />
              </ProtectedRoute>
            } />
            <Route path="/history" element={
              <ProtectedRoute>
                <History />
              </ProtectedRoute>
            } />
            <Route path="/profile" element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            } />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
