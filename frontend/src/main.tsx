import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import './index.css';
import { Providers } from '@/app/providers';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { AppShell } from '@/components/layout/AppShell';
import { AdminShell } from '@/components/layout/AdminShell';

import { LandingPage } from '@/features/landing/LandingPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage';
import { AuthCallback } from '@/features/auth/AuthCallback';

import { DrivePage } from '@/features/drive/DrivePage';
import { FileDetailPage } from '@/features/drive/FileDetailPage';
import { SharedPage } from '@/features/shared/SharedPage';
import { ReleasedPage } from '@/features/released/ReleasedPage';
import { ApprovalsPage } from '@/features/approvals/ApprovalsPage';
import { MessagesPage } from '@/features/messages/MessagesPage';
import { ArchivePage } from '@/features/storage/ArchivePage';
import { BinPage } from '@/features/storage/BinPage';
import { MembersPage } from '@/features/org/MembersPage';
import { OrgMonitorPage } from '@/features/org/OrgMonitorPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { SearchPage } from '@/features/search/SearchPage';

import { AdminDashboard } from '@/features/system-admin/AdminDashboard';
import { OrganizationsPage } from '@/features/system-admin/OrganizationsPage';
import { OrgDetailsPage } from '@/features/system-admin/OrgDetailsPage';
import { AdminActivityPage } from '@/features/system-admin/AdminActivityPage';

const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/reset', element: <ResetPasswordPage /> },
  { path: '/auth/callback', element: <AuthCallback /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/app',
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/app/drive" replace /> },
          { path: 'drive', element: <DrivePage /> },
          { path: 'file/:id', element: <FileDetailPage /> },
          { path: 'shared', element: <SharedPage /> },
          { path: 'released', element: <ReleasedPage /> },
          { path: 'approvals', element: <ApprovalsPage /> },
          { path: 'messages', element: <MessagesPage /> },
          { path: 'archive', element: <ArchivePage /> },
          { path: 'bin', element: <BinPage /> },
          { path: 'members', element: <MembersPage /> },
          { path: 'org', element: <OrgMonitorPage /> },
          { path: 'settings', element: <SettingsPage /> },
          { path: 'search', element: <SearchPage /> },
        ],
      },
    ],
  },
  {
    element: <ProtectedRoute adminOnly />,
    children: [
      {
        path: '/admin',
        element: <AdminShell />,
        children: [
          { index: true, element: <AdminDashboard /> },
          { path: 'organizations', element: <OrganizationsPage /> },
          { path: 'organizations/:id', element: <OrgDetailsPage /> },
          { path: 'activity', element: <AdminActivityPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </React.StrictMode>,
);
