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
import { PositionsPage } from '@/features/org/PositionsPage';
import { DocTypeSettingsPage } from '@/features/org/DocTypeSettingsPage';
import { OrgMonitorPage } from '@/features/org/OrgMonitorPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { SearchPage } from '@/features/search/SearchPage';
import { ReportsPage } from '@/features/reports/ReportsPage';
import { MyDocumentsReport } from '@/features/reports/staff/MyDocumentsReport';
import { MyApprovalRequestsReport } from '@/features/reports/staff/MyApprovalRequestsReport';
import { MyApprovalQueueReport } from '@/features/reports/staff/MyApprovalQueueReport';
import { MyReleasedReport } from '@/features/reports/staff/MyReleasedReport';
import { OfficeSummaryReport } from '@/features/reports/office/OfficeSummaryReport';
import { DocumentRegisterReport } from '@/features/reports/office/DocumentRegisterReport';
import { ApprovalReportPage } from '@/features/reports/office/ApprovalReportPage';
import { MemberActivityReport } from '@/features/reports/office/MemberActivityReport';
import { MemberDirectoryReport } from '@/features/reports/office/MemberDirectoryReport';
import { ReleasedRegisterReport } from '@/features/reports/office/ReleasedRegisterReport';
import { DocumentTypeReport } from '@/features/reports/office/DocumentTypeReport';
import { AdminReportsPage } from '@/features/reports/AdminReportsPage';

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
          { path: 'positions', element: <PositionsPage /> },
          { path: 'doc-types', element: <DocTypeSettingsPage /> },
          { path: 'org', element: <OrgMonitorPage /> },
          { path: 'settings', element: <SettingsPage /> },
          { path: 'search', element: <SearchPage /> },
          { path: 'reports', element: <ReportsPage /> },
          { path: 'reports/my-documents', element: <MyDocumentsReport /> },
          { path: 'reports/my-approval-requests', element: <MyApprovalRequestsReport /> },
          { path: 'reports/my-approval-queue', element: <MyApprovalQueueReport /> },
          { path: 'reports/my-released', element: <MyReleasedReport /> },
          { path: 'reports/office-summary', element: <OfficeSummaryReport /> },
          { path: 'reports/document-register', element: <DocumentRegisterReport /> },
          { path: 'reports/approval-report', element: <ApprovalReportPage /> },
          { path: 'reports/released-register', element: <ReleasedRegisterReport /> },
          { path: 'reports/member-activity', element: <MemberActivityReport /> },
          { path: 'reports/member-directory', element: <MemberDirectoryReport /> },
          { path: 'reports/document-type', element: <DocumentTypeReport /> },
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
          { path: 'reports', element: <AdminReportsPage /> },
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
