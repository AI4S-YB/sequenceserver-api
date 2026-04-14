import { createBrowserRouter } from 'react-router-dom'
import { AppShell } from '../components/app-shell'
import { BlastNewPage } from '../pages/blast-new-page'
import { BlastJobDetailPage } from '../pages/blast-job-detail-page'
import { DashboardPage } from '../pages/dashboard-page'
import { DatabaseJobDetailPage } from '../pages/database-job-detail-page'
import { DatabasesPage } from '../pages/databases-page'
import { JobsPage } from '../pages/jobs-page'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'databases', element: <DatabasesPage /> },
      { path: 'blast/new', element: <BlastNewPage /> },
      { path: 'jobs', element: <JobsPage /> },
      { path: 'jobs/blast/:id', element: <BlastJobDetailPage /> },
      { path: 'jobs/database/:id', element: <DatabaseJobDetailPage /> },
    ],
  },
])
