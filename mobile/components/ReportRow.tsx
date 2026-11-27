import type { ReportStatus } from '@/services/api';
import { StatusPill } from './Feedback';

const statuses = {
  pending: { label: 'Pending', tone: 'warning' },
  forwarded: { label: 'Pending', tone: 'warning' },
  verified: { label: 'Under Work', tone: 'success' },
  under_work: { label: 'Under Work', tone: 'success' },
  resolved: { label: 'Resolved', tone: 'neutral' },
  rejected: { label: 'Rejected', tone: 'neutral' },
  closed: { label: 'Resolved', tone: 'neutral' },
} as const satisfies Record<ReportStatus, { label: string; tone: string }>;

export function ReportStatusPill({ status }: { status: ReportStatus }) {
  return <StatusPill {...statuses[status]} />;
}
